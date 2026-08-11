import { INVENTORY_URL } from "./config.js";
import { launchRithumBrowser, mainPage } from "./browser.js";

const FIFTEEN_MINUTES = 15 * 60 * 1_000;

const context = await launchRithumBrowser();

try {
  const page = await mainPage(context);
  await page.goto(INVENTORY_URL, { waitUntil: "domcontentloaded" });

  console.log("浏览器已打开。请手动完成 Rithum 登录和 MFA。\n");
  console.log("程序会在 Inventory 页面加载成功后自动保存本地会话并退出。\n");

  await page
    .getByRole("button", { name: "Update Item Inventory", exact: true })
    .waitFor({ state: "visible", timeout: FIFTEEN_MINUTES });

  if (!page.url().startsWith(INVENTORY_URL)) {
    throw new Error(`登录完成后未进入 Inventory：${page.url()}`);
  }

  console.log("登录会话已保存，可以运行单 SKU 预演。\n");
} finally {
  await context.close();
}

