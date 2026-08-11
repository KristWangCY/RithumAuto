import { launchRithumBrowser, mainPage } from "./browser.js";
import { openInventory } from "./inventory.js";

const context = await launchRithumBrowser();
try {
  const page = await mainPage(context);
  await openInventory(page);
  console.log("LOGIN_OK：Rithum Inventory 已成功打开。 ");
} finally {
  await context.close();
}

