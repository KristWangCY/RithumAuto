import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { LOG_DIR } from "./config.js";

const LONDON_TIME = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export interface RunLogger {
  path: string;
  write(info: string, operation: string): Promise<void>;
}

export async function createRunLogger(): Promise<RunLogger> {
  const fileStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(LOG_DIR, `rithum-auto-${fileStamp}.log`);
  await mkdir(dirname(path), { recursive: true });

  return {
    path,
    async write(info: string, operation: string): Promise<void> {
      const timestamp = LONDON_TIME.format(new Date());
      const line = `${timestamp} Europe/London + ${singleLine(info)} + ${singleLine(operation)}\n`;
      await appendFile(path, line, "utf8");
      process.stdout.write(line);
    },
  };
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
