import { mkdir, open, rm, type FileHandle } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const LOCK_PATH = resolve(".runtime/rithum-auto.lock");

export async function acquireRunLock(): Promise<() => Promise<void>> {
  await mkdir(dirname(LOCK_PATH), { recursive: true });

  let handle: FileHandle;
  try {
    handle = await open(LOCK_PATH, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("已有一个 RithumAuto 任务正在运行。若任务已异常退出，请删除 .runtime/rithum-auto.lock。", {
        cause: error,
      });
    }
    throw error;
  }

  await handle.writeFile(
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
  );

  return async () => {
    await handle.close();
    await rm(LOCK_PATH, { force: true });
  };
}

