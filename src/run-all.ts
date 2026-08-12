import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { launchRithumBrowser, mainPage } from "./browser.js";
import { ALLOW_COMMIT, LOG_DIR, wantsCommit } from "./config.js";
import {
  listAllSkus,
  openInventory,
  previewOrCommit,
  selectSingleSku,
} from "./inventory.js";
import { acquireRunLock } from "./lock.js";
import { createRunLogger } from "./run-log.js";

const OPERATION = "勾选白框 > Update Item Inventory > Save Changes";

export interface BatchProgress {
  message: string;
  completed: number;
  total: number | null;
  failed: number;
  logFile: string | null;
}

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  logFile: string;
}

export type BatchProgressListener = (progress: BatchProgress) => void;

export async function runAllInventory(
  argv: string[],
  onProgress: BatchProgressListener = () => undefined,
): Promise<BatchResult> {
  if (!wantsCommit(argv) || !ALLOW_COMMIT) {
    throw new Error(
      "拒绝批量更新：必须同时使用 --commit 并设置 RITHUM_ALLOW_COMMIT=true。",
    );
  }
  const completedSkus = readCsvArgument(argv, "--completed");

  const logger = await createRunLogger();
  console.log(`LOG_FILE=${logger.path}`);
  emit(onProgress, {
    message: "正在启动浏览器并登录 Rithum…",
    completed: 0,
    total: null,
    failed: 0,
    logFile: logger.path,
  });

  const releaseLock = await acquireRunLock();
  let context: Awaited<ReturnType<typeof launchRithumBrowser>> | undefined;
  let failed = 0;

  try {
    context = await launchRithumBrowser();
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
    let completed = completedSkus.length;
    emit(onProgress, {
      message: `已读取 ${skus.length} 个 SKU，准备逐个保存…`,
      completed,
      total: skus.length,
      failed,
      logFile: logger.path,
    });
    console.log(
      `共 ${skus.length} 个 SKU；已确认 ${completedSkus.length} 个，本次继续处理 ${pendingSkus.length} 个。`,
    );

    for (const sku of pendingSkus) {
      emit(onProgress, {
        message: `正在处理 ${sku}（${completed + 1}/${skus.length}）…`,
        completed,
        total: skus.length,
        failed,
        logFile: logger.path,
      });

      try {
        // Reloading resets the previous selection and search state so exactly
        // one SKU is selected for every Save Changes operation.
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

        await mkdir(LOG_DIR, { recursive: true });
        const safeSku = sku.replace(/[^A-Za-z0-9._-]/g, "_");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        await page
          .screenshot({
            path: resolve(LOG_DIR, `failure-${safeSku}-${stamp}.png`),
            fullPage: false,
          })
          .catch(() => undefined);
      }

      completed += 1;
      emit(onProgress, {
        message: `${sku} 已处理，完成 ${completed}/${skus.length}。`,
        completed,
        total: skus.length,
        failed,
        logFile: logger.path,
      });
    }

    await logger.write(
      `遍历完成; 总数=${skus.length}; 成功=${skus.length - failed}; 失败=${failed}`,
      "批量运行汇总",
    );

    console.log(`LOG_FILE=${logger.path}`);
    if (failed > 0) {
      throw new Error(`批量运行完成，但有 ${failed} 个 SKU 失败。`);
    }

    return {
      total: skus.length,
      succeeded: skus.length - failed,
      failed,
      logFile: logger.path,
    };
  } finally {
    await context?.close().catch(() => undefined);
    await releaseLock();
  }
}

function emit(listener: BatchProgressListener, progress: BatchProgress): void {
  try {
    listener(progress);
  } catch {
    // A status display must never interrupt an inventory operation.
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

async function runFromCommandLine(): Promise<void> {
  try {
    await runAllInventory(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAILED：${message}`);
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  await runFromCommandLine();
}
