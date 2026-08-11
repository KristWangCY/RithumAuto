import { ALLOW_COMMIT } from "./config.js";
import {
  runAllInventory,
  type BatchProgress,
  type BatchResult,
} from "./run-all.js";

export type RunState = "idle" | "running" | "success" | "failed";

export interface RunStatus {
  state: RunState;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  logFile: string | null;
  completed: number;
  total: number | null;
  failed: number;
}

type StatusListener = (status: RunStatus) => void;

const listeners = new Set<StatusListener>();

let status: RunStatus = {
  state: "idle",
  message: "尚未运行。",
  startedAt: null,
  finishedAt: null,
  logFile: null,
  completed: 0,
  total: null,
  failed: 0,
};

export function getRunStatus(): RunStatus {
  return { ...status };
}

export function isRunActive(): boolean {
  return status.state === "running";
}

export function subscribeRunStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startManagedInventoryUpdate(): RunStatus {
  if (!ALLOW_COMMIT) {
    throw new Error(
      "更新开关未启用：请设置 RITHUM_ALLOW_COMMIT=true。",
    );
  }
  if (isRunActive()) {
    throw new Error("批量更新已在运行中。");
  }

  updateStatus({
    state: "running",
    message: "正在启动批量更新…",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logFile: null,
    completed: 0,
    total: null,
    failed: 0,
  });

  void runAllInventory(["--commit"], handleProgress)
    .then(handleSuccess)
    .catch(handleFailure);

  return getRunStatus();
}

function handleProgress(progress: BatchProgress): void {
  updateStatus({
    ...status,
    state: "running",
    message: progress.message,
    logFile: progress.logFile,
    completed: progress.completed,
    total: progress.total,
    failed: progress.failed,
  });
}

function handleSuccess(result: BatchResult): void {
  updateStatus({
    ...status,
    state: "success",
    message: `全部完成：成功 ${result.succeeded}/${result.total}，失败 ${result.failed}。`,
    finishedAt: new Date().toISOString(),
    logFile: result.logFile,
    completed: result.total,
    total: result.total,
    failed: result.failed,
  });
}

function handleFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  updateStatus({
    ...status,
    state: "failed",
    message: `批量更新失败：${message}`,
    finishedAt: new Date().toISOString(),
  });
}

function updateStatus(next: RunStatus): void {
  status = next;
  for (const listener of listeners) {
    try {
      listener(getRunStatus());
    } catch {
      // A renderer or browser listener must not affect the batch operation.
    }
  }
}
