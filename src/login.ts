import type { Locator, Page } from "playwright";

import { TIMEOUT_MS } from "./config.js";
import { getRithumCredentials } from "./credentials.js";

const INVENTORY_BUTTON = "Update Item Inventory";

export async function loginIfRequired(page: Page): Promise<void> {
  const updateButton = page.getByRole("button", {
    name: INVENTORY_BUTTON,
    exact: true,
  });

  if (await waitVisible(updateButton, 5_000)) return;

  const credentials = await getRithumCredentials();
  try {
    const email = page.getByRole("textbox", { name: "Email", exact: true });
    if (await waitVisible(email, TIMEOUT_MS)) {
      await email.fill(credentials.username);
      await page
        .getByRole("button", { name: "Continue", exact: true })
        .click();
    }

    const password = page.locator('input[type="password"]');
    await password.waitFor({ state: "visible", timeout: TIMEOUT_MS });
    await password.fill(credentials.password);

    const submit = page
      .getByRole("button", { name: /^(continue|sign in|log in)$/i })
      .first();
    await submit.click();

    await updateButton.waitFor({ state: "visible", timeout: 60_000 });
  } catch (error) {
    throw new Error(
      "自动登录未完成，可能需要 MFA、验证码或重新保存凭据。",
      { cause: error },
    );
  } finally {
    credentials.password = "";
  }
}

async function waitVisible(locator: Locator, timeout: number): Promise<boolean> {
  return locator
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}
