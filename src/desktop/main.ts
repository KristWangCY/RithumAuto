import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
} from "electron";

import type { RithumCredentials } from "../credentials.js";

const execFileAsync = promisify(execFile);
app.setName("RithumAuto");
const gotSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | null = null;
let credentialsPath = "";
let isQuitting = false;
let dailyTimer: NodeJS.Timeout | undefined;

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  void app.whenReady().then(startDesktopApp).catch(showFatalError);
}

async function startDesktopApp(): Promise<void> {
  const dataDir = app.getPath("userData");
  credentialsPath = resolve(dataDir, "credentials.secure.json");

  // The A button is the explicit user authorization for a real update. The
  // command layer still requires --commit as its second safety gate.
  process.env.RITHUM_DATA_DIR = dataDir;
  process.env.RITHUM_ALLOW_COMMIT = "true";
  process.env.RITHUM_HEADLESS = "true";

  await migrateLegacyData(dataDir);

  const [{ setCredentialsProvider }, runManager, { readAllLogs }] =
    await Promise.all([
      import("../credentials.js"),
      import("../run-manager.js"),
      import("../logs.js"),
    ]);

  setCredentialsProvider(readDesktopCredentials);

  ipcMain.handle("credentials:has", hasDesktopCredentials);
  ipcMain.handle(
    "credentials:save",
    async (_event, username: unknown, password: unknown) => {
      await saveDesktopCredentials(validateCredentials(username, password));
      return { ok: true };
    },
  );
  ipcMain.handle("run:status", runManager.getRunStatus);
  ipcMain.handle("run:start", async () => {
    if (!(await hasDesktopCredentials())) {
      throw new Error("请先安全保存 Rithum 登录账号。" );
    }
    return runManager.startManagedInventoryUpdate();
  });
  ipcMain.handle("logs:list", readAllLogs);

  mainWindow = createMainWindow();
  configureMacLoginLaunch();
  scheduleMacDailyUpdate(runManager);
  runManager.subscribeRunStatus((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("run:status-changed", status);
    }
  });

  mainWindow.on("close", (event) => {
    if (process.platform === "darwin" && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return;
    }
    if (!runManager.isRunActive()) return;
    event.preventDefault();
    isQuitting = false;
    void dialog.showMessageBox(mainWindow!, {
      type: "info",
      title: "任务仍在运行",
      message: "Inventory 更新尚未完成",
      detail: "请等待任务完成后再关闭 RithumAuto，以免中断当前 SKU。",
      buttons: ["继续等待"],
      defaultId: 0,
    });
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadFile(resolve(app.getAppPath(), "desktop", "index.html"));
  const openedAtLogin =
    process.platform === "darwin" &&
    app.getLoginItemSettings().wasOpenedAsHidden;
  if (!openedAtLogin) mainWindow.show();
}

function createMainWindow(): BrowserWindow {
  return new BrowserWindow({
    width: 1060,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    show: false,
    backgroundColor: "#f5f6f8",
    autoHideMenuBar: true,
    title: "RithumAuto",
    webPreferences: {
      preload: resolve(app.getAppPath(), "desktop", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
}

async function hasDesktopCredentials(): Promise<boolean> {
  try {
    await readDesktopCredentials();
    return true;
  } catch {
    return false;
  }
}

async function readDesktopCredentials(): Promise<RithumCredentials> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储当前不可用。请登录电脑后重试。" );
  }

  const record = JSON.parse(await readFile(credentialsPath, "utf8")) as {
    version?: unknown;
    encrypted?: unknown;
  };
  if (record.version !== 1 || typeof record.encrypted !== "string") {
    throw new Error("本机加密凭据格式无效。" );
  }

  const decrypted = safeStorage.decryptString(
    Buffer.from(record.encrypted, "base64"),
  );
  const credentials = JSON.parse(decrypted) as Partial<RithumCredentials>;
  if (!credentials.username || !credentials.password) {
    throw new Error("本机加密凭据不完整。" );
  }
  return { username: credentials.username, password: credentials.password };
}

async function saveDesktopCredentials(
  credentials: RithumCredentials,
): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储当前不可用。请登录电脑后重试。" );
  }

  const encrypted = safeStorage
    .encryptString(JSON.stringify(credentials))
    .toString("base64");
  await mkdir(resolve(credentialsPath, ".."), { recursive: true });
  await writeFile(
    credentialsPath,
    JSON.stringify({ version: 1, encrypted }),
    "utf8",
  );
  credentials.password = "";
}

function validateCredentials(
  username: unknown,
  password: unknown,
): RithumCredentials {
  if (typeof username !== "string" || !/^\S+@\S+\.\S+$/.test(username.trim())) {
    throw new Error("请输入有效的登录邮箱。" );
  }
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("请输入登录密码。" );
  }
  return { username: username.trim(), password };
}

async function migrateLegacyData(dataDir: string): Promise<void> {
  await migrateLegacyLogs(dataDir);
  if (process.platform !== "win32") return;
  if (existsSync(credentialsPath)) return;

  const legacyPath = resolve(
    process.cwd(),
    ".runtime",
    "rithum-credentials.json",
  );
  const readerPath = resolve(
    app.isPackaged ? process.resourcesPath : app.getAppPath(),
    "scripts",
    "read-credentials.ps1",
  );
  if (!existsSync(legacyPath) || !existsSync(readerPath)) return;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        readerPath,
        "-CredentialPath",
        legacyPath,
      ],
      { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 },
    );
    const parsed = JSON.parse(stdout) as Partial<RithumCredentials>;
    const credentials = validateCredentials(parsed.username, parsed.password);
    await saveDesktopCredentials(credentials);
  } catch {
    // If the legacy DPAPI record belongs to another Windows user, the desktop
    // UI will ask for credentials the first time A is clicked.
  }
}

function configureMacLoginLaunch(): void {
  if (
    process.platform !== "darwin" ||
    !app.isPackaged ||
    process.argv.includes("--disable-auto-schedule")
  ) {
    return;
  }
  app.setLoginItemSettings({
    openAtLogin: true,
    openAsHidden: true,
  });
}

function scheduleMacDailyUpdate(
  runManager: typeof import("../run-manager.js"),
): void {
  if (
    process.platform !== "darwin" ||
    process.argv.includes("--disable-auto-schedule")
  ) {
    return;
  }

  const scheduleNext = (): void => {
    if (dailyTimer) clearTimeout(dailyTimer);
    const now = new Date();
    const next = new Date(now);
    next.setHours(9, 30, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);

    dailyTimer = setTimeout(() => {
      void runScheduledUpdate(runManager).finally(scheduleNext);
    }, next.getTime() - now.getTime());
  };

  scheduleNext();
}

async function runScheduledUpdate(
  runManager: typeof import("../run-manager.js"),
): Promise<void> {
  if (runManager.isRunActive() || !(await hasDesktopCredentials())) return;
  try {
    runManager.startManagedInventoryUpdate();
  } catch {
    // The run manager exposes any operational failure to the desktop status.
  }
}

async function migrateLegacyLogs(dataDir: string): Promise<void> {
  const legacyLogDir = resolve(process.cwd(), "logs");
  const desktopLogDir = resolve(dataDir, "logs");
  if (!existsSync(legacyLogDir) || legacyLogDir === desktopLogDir) return;

  await mkdir(desktopLogDir, { recursive: true });
  const entries = await readdir(legacyLogDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map(async (entry) => {
        const destination = resolve(desktopLogDir, entry.name);
        if (!existsSync(destination)) {
          await copyFile(resolve(legacyLogDir, entry.name), destination);
        }
      }),
  );
}

function showFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox("RithumAuto 无法启动", message);
  app.quit();
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("activate", () => {
  mainWindow?.show();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
