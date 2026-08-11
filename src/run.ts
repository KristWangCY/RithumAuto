import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { launchRithumBrowser, mainPage } from "./browser.js";
import { ALLOW_COMMIT, readSku, wantsCommit } from "./config.js";
import { openInventory, previewOrCommit, selectSingleSku } from "./inventory.js";
import { acquireRunLock } from "./lock.js";

async function main(): Promise<void> {
  const sku = readSku(process.argv.slice(2));
  const commit = wantsCommit(process.argv.slice(2));

  if (commit && !ALLOW_COMMIT) {
    throw new Error(
      "拒绝真实更新：除了 --commit，还必须设置 RITHUM_ALLOW_COMMIT=true。",
    );
  }

  const releaseLock = await acquireRunLock();
  const context = await launchRithumBrowser();

  try {
    const page = await mainPage(context);
    await openInventory(page);

    const { snapshot } = await selectSingleSku(page, sku);
    console.log(`已唯一定位 SKU：${snapshot.sku}`);
    console.log(`当前商品行：${snapshot.cells.join(" | ")}`);

    await previewOrCommit(page, sku, commit);
  } catch (error) {
    await mkdir(resolve("logs"), { recursive: true });
    const page = context.pages()[0];
    if (page) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await page
        .screenshot({
          path: resolve("logs", `failure-${stamp}.png`),
          fullPage: false,
        })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    await context.close();
    await releaseLock();
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FAILED：${message}`);
  process.exitCode = 1;
}

