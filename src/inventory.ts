import type { ElementHandle, Locator, Page } from "playwright";

import { INVENTORY_URL, TIMEOUT_MS, VERIFY_TIMEOUT_MS } from "./config.js";
import { loginIfRequired } from "./login.js";

const UPDATE_BUTTON = "Update Item Inventory";
const SAVE_BUTTON = "Save Changes";
const SUCCESS_MESSAGE =
  "Item has been validated and is processing through the system.";

export interface ItemSnapshot {
  sku: string;
  cells: string[];
}

export async function listAllSkus(page: Page): Promise<string[]> {
  await page.getByText("End of results.", { exact: true }).waitFor({
    state: "visible",
    timeout: TIMEOUT_MS,
  });

  const rawSkus = await page
    .locator('a[href^="/item-detail/"]')
    .allTextContents();
  const skus = [...new Set(rawSkus.map((sku) => sku.trim()).filter(Boolean))];

  if (skus.length === 0) {
    throw new Error("Inventory 页面没有找到任何 SKU，已停止。 ");
  }

  return skus;
}

export async function openInventory(page: Page): Promise<void> {
  await page.goto(INVENTORY_URL, { waitUntil: "domcontentloaded" });
  await loginIfRequired(page);

  const updateButton = page.getByRole("button", {
    name: UPDATE_BUTTON,
    exact: true,
  });

  try {
    await updateButton.waitFor({ state: "visible", timeout: TIMEOUT_MS });
  } catch (error) {
    if (!page.url().startsWith(INVENTORY_URL)) {
      throw new Error("Rithum 登录会话已失效。请先运行 npm run auth。", {
        cause: error,
      });
    }
    throw error;
  }
}

export async function selectSingleSku(
  page: Page,
  sku: string,
): Promise<{ row: Locator; snapshot: ItemSnapshot }> {
  let firstError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await selectSingleSkuOnce(page, sku);
    } catch (error) {
      firstError ??= error;
      if (attempt === 2) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`SKU ${sku} 两次定位均失败：${message}`, {
          cause: firstError,
        });
      }

      // The Inventory search component can retain stale text after navigation.
      // Reload once before retrying so a transient render/search failure does
      // not mark the SKU as failed immediately.
      await openInventory(page);
    }
  }

  throw new Error(`SKU ${sku} 定位失败。`, { cause: firstError });
}

async function selectSingleSkuOnce(
  page: Page,
  sku: string,
): Promise<{ row: Locator; snapshot: ItemSnapshot }> {
  const search = page.getByPlaceholder("Search...", { exact: true });
  // ui-input-search is a DSCO custom element whose native input is encapsulated.
  // Clicking the host focuses the input; keyboard typing then reaches it.
  await search.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(sku);
  await page.waitForTimeout(800);

  const skuLink = page.getByRole("link", { name: sku, exact: true });
  await skuLink.waitFor({ state: "visible" });

  const exactMatches = await skuLink.count();
  if (exactMatches !== 1) {
    throw new Error(`SKU ${sku} 精确匹配到 ${exactMatches} 行，已停止。`);
  }

  const row = page.getByRole("row").filter({ has: skuLink });
  if ((await row.count()) !== 1) {
    throw new Error(`无法唯一定位 SKU ${sku} 所在的商品行。`);
  }

  const cells = (await row.getByRole("cell").allTextContents()).map((text) =>
    text.trim().replace(/\s+/g, " "),
  );
  const rowSku = cells[1];
  if (rowSku !== sku) {
    throw new Error(`商品行二次核对失败：预期 ${sku}，实际 ${rowSku ?? "空"}。`);
  }

  const checkbox = row.getByRole("checkbox", { name: "check", exact: true });
  // DSCO hides the native checkbox and renders span.box as the visible control.
  const checkboxBox = row.locator("label > span.box").first();
  await checkboxBox.click();
  if (!(await checkbox.isChecked())) {
    throw new Error(`SKU ${sku} 的复选框点击后仍未选中。`);
  }

  const updateButton = page.getByRole("button", {
    name: UPDATE_BUTTON,
    exact: true,
  });
  if (!(await updateButton.isEnabled())) {
    throw new Error(`SKU ${sku} 已找到，但更新按钮仍不可用。`);
  }

  return { row, snapshot: { sku, cells } };
}

export async function previewOrCommit(
  page: Page,
  sku: string,
  commit: boolean,
): Promise<void> {
  const beforeFirstNotification = await firstNotificationHandle(page);

  await page
    .getByRole("button", { name: UPDATE_BUTTON, exact: true })
    .click();

  const save = page.getByRole("button", { name: SAVE_BUTTON, exact: true });
  await save.waitFor({ state: "visible" });

  if (!commit) {
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await save.waitFor({ state: "hidden" });
    console.log(`DRY RUN：已定位 ${sku} 并打开更新表单；没有保存任何修改。`);
    return;
  }

  await save.click();
  await save.waitFor({ state: "hidden" });
  await waitForNewSuccessNotification(page, beforeFirstNotification);

  console.log(`SUCCESS：${sku} 已提交，Rithum 已验证并开始处理。`);
}

async function firstNotificationHandle(
  page: Page,
): Promise<ElementHandle<HTMLElement> | null> {
  const first = page.locator("ui-notification").first();
  return (await first.count()) > 0
    ? ((await first.elementHandle()) as ElementHandle<HTMLElement> | null)
    : null;
}

async function waitForNewSuccessNotification(
  page: Page,
  previous: ElementHandle<HTMLElement> | null,
): Promise<void> {
  await page.waitForFunction(
    (previousFirst) => {
      const current = document.querySelector("ui-notification");
      return current !== null && current !== previousFirst;
    },
    previous,
    { timeout: VERIFY_TIMEOUT_MS },
  );

  const message = page.locator("ui-notification-summary").first();
  // Notifications remain in the DOM while the notification panel is collapsed.
  // Presence plus the exact text is authoritative; visual visibility is not.
  await message.waitFor({ state: "attached", timeout: VERIFY_TIMEOUT_MS });
  const text = (await message.textContent())?.trim().replace(/\s+/g, " ") ?? "";
  if (text !== SUCCESS_MESSAGE) {
    throw new Error(`Rithum 返回了新的通知，但不是预期成功信息：${text}`);
  }
}
