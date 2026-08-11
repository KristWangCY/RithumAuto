import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

if (existsSync(resolve(".env"))) {
  loadEnvFile(resolve(".env"));
}

export const INVENTORY_URL =
  process.env.RITHUM_INVENTORY_URL ?? "https://app.dsco.io/inventory";

export const PROFILE_DIR = resolve(
  process.env.RITHUM_PROFILE_DIR ?? ".runtime/rithum-profile",
);

export const TIMEOUT_MS = readPositiveInteger("RITHUM_TIMEOUT_MS", 30_000);
export const VERIFY_TIMEOUT_MS = readPositiveInteger(
  "RITHUM_VERIFY_TIMEOUT_MS",
  60_000,
);

export const HEADLESS = readBoolean("RITHUM_HEADLESS", false);
export const ALLOW_COMMIT = readBoolean("RITHUM_ALLOW_COMMIT", false);

export function readSku(argv: string[]): string {
  const inline = argv.find((arg) => arg.startsWith("--sku="));
  const skuFlagIndex = argv.indexOf("--sku");
  const value =
    inline?.slice("--sku=".length) ??
    (skuFlagIndex >= 0 ? argv[skuFlagIndex + 1] : undefined) ??
    process.env.RITHUM_SKU;

  const sku = value?.trim();
  if (!sku || sku === "YOUR-SKU") {
    throw new Error(
      "缺少 SKU。请使用 --sku YOUR-SKU，或在 .env 中设置 RITHUM_SKU。",
    );
  }

  if (!/^[A-Za-z0-9._-]+$/.test(sku)) {
    throw new Error(`SKU 格式不安全：${JSON.stringify(sku)}`);
  }

  return sku;
}

export function wantsCommit(argv: string[]): boolean {
  return argv.includes("--commit");
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (/^(1|true|yes)$/i.test(value)) return true;
  if (/^(0|false|no)$/i.test(value)) return false;
  throw new Error(`${name} 必须是 true 或 false。`);
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是正整数。`);
  }
  return parsed;
}

