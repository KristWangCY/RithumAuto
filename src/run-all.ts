import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { launchRithumBrowser, mainPage } from "./browser.js";
import { ALLOW_COMMIT, wantsCommit } from "./config.js";
import {
  listAllSkus,
  openInventory,
  previewOrCommit,
  selectSingleSku,
} from "./inventory.js";
import { acquireRunLock } from "./lock.js";
import { createRunLogger } from "./run-log.js";

const OPERATION = "勾选白框 > Update Item Inventory > Save Changes";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (!wantsCommit(argv) || !ALLOW_COMMIT) {
    throw new Error(
      "拒绝批量更新：必须同时使用 --commit 并设置 RITHUM_ALLOW_COMMIT=true。",
    );
  }
  const completedSkus = readCsvArgument(argv, "--completed");

  const logger = await createRunLogger();
  console.log(`LOG_FILE=${logger.path}`);

  const releaseLock = await acquireRunLock();
  const context = await launchRithumBrowser();
  let failed = 0;

  try {
    const page = await mainPage(context);
    await openInventory(page);
    const skus = await listAllSkus(page);
    const unknownCompleted = completedSkus.filter((sku) => !skus.includes(sku));
    if (unknownCompleted.length > 0) {
      throw new Error(
        `--completed 包含 Inventory 中不存在的 SKU：${unknownCompleted.join(", ")}`,
      );
    }

    for (const sku of completedSkus) {
      await logger.write(
        `SKU=${sku}; Rithum 已验证，正在处理（中断前已完成）`,
        OPERATION,
      );
    }

    const pendingSkus = skus.filter((sku) => !completedSkus.includes(sku));
    console.log(
      `共 ${skus.length} 个 SKU；已确认 ${completedSkus.length} 个，本次继续处理 ${pendingSkus.length} 个。`,
    );

    for (const sku of pendingSkus) {
      try {
        // Reloading the inventory route resets the previous row selection and
        // search state, guaranteeing that exactly one SKU is selected each time.
        await openInventory(page);
        await selectSingleSku(page, sku);
        await previewOrCommit(page, sku, true);
        await logger.write(
          `SKU=${sku}; Rithum 已验证，正在处理`,
          OPERATION,
        );
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        await logger.write(`SKU=${sku}; FAILED: ${message}`, OPERATION);

        await mkdir(resolve("logs"), { recursive: true });
        const safeSku = sku.replace(/[^A-Za-z0-9._-]/g, "_");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        await page
          .screenshot({
            path: resolve("logs", `failure-${safeSku}-${stamp}.png`),
            fullPage: false,
          })
          .catch(() => undefined);
      }
    }

    await logger.write(
      `遍历完成; 总数=${skus.length}; 成功=${skus.length - failed}; 失败=${failed}`,
      "批量运行汇总",
    );

    console.log(`LOG_FILE=${logger.path}`);
    if (failed > 0) {
      throw new Error(`批量运行完成，但有 ${failed} 个 SKU 失败。`);
    }
  } finally {
    await context.close();
    await releaseLock();
  }
}

function readCsvArgument(argv: string[], name: string): string[] {
  const prefix = `${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (!inline) return [];
  return [
    ...new Set(
      inline
        .slice(prefix.length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAILED：${message}`);
  process.exitCode = 1;
}
