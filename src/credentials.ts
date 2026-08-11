import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CREDENTIAL_PATH = resolve(".runtime/rithum-credentials.json");
const READER_PATH = resolve("scripts/read-credentials.ps1");

export interface RithumCredentials {
  username: string;
  password: string;
}

export async function readEncryptedCredentials(): Promise<RithumCredentials> {
  if (!existsSync(CREDENTIAL_PATH)) {
    throw new Error(
      "登录会话已失效，且没有加密凭据。请运行 npm run credentials -- -UserName YOUR-EMAIL。",
    );
  }

  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      READER_PATH,
      "-CredentialPath",
      CREDENTIAL_PATH,
    ],
    { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 },
  );

  const parsed = JSON.parse(stdout) as Partial<RithumCredentials>;
  if (!parsed.username || !parsed.password) {
    throw new Error("加密凭据文件无效。请重新运行凭据保存命令。 ");
  }
  return { username: parsed.username, password: parsed.password };
}

