import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright";

import { HEADLESS, PROFILE_DIR, TIMEOUT_MS } from "./config.js";

export async function launchRithumBrowser(): Promise<BrowserContext> {
  await mkdir(PROFILE_DIR, { recursive: true });

  return chromium.launchPersistentContext(PROFILE_DIR, {
    channel: "chrome",
    headless: HEADLESS,
    viewport: null,
    args: ["--start-maximized"],
  });
}

export async function mainPage(context: BrowserContext): Promise<Page> {
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(TIMEOUT_MS);
  page.setDefaultNavigationTimeout(TIMEOUT_MS);
  return page;
}

