import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { LOG_DIR } from "./config.js";

export interface LogEntry {
  name: string;
  updatedAt: string;
  content: string;
}

export async function readAllLogs(): Promise<LogEntry[]> {
  let names: string[];
  try {
    const entries = await readdir(LOG_DIR, { withFileTypes: true });
    names = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const logs = await Promise.all(
    names.map(async (name): Promise<LogEntry> => {
      const path = resolve(LOG_DIR, name);
      const [metadata, content] = await Promise.all([
        stat(path),
        readFile(path, "utf8"),
      ]);
      return { name, updatedAt: metadata.mtime.toISOString(), content };
    }),
  );

  return logs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
