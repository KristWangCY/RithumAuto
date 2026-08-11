# RithumAuto

第一阶段目标：在 Rithum / DSCO 中对一个明确的 SKU 完成安全的端到端库存更新。

当前脚本执行以下流程：

1. 使用独立的本地 Chrome 配置打开 `https://app.dsco.io/inventory`；
2. 在 `Search...` 中精确搜索一个 SKU；
3. 二次核对商品行里的 SKU；
4. 只勾选这一行；
5. 打开 `Update Item Inventory`；
6. 保持现有库存字段不变；
7. 仅在显式授权时点击 `Save Changes`；
8. 等待一条新的成功通知，确认 Rithum 已验证并开始处理。

## 安装

```powershell
npm install
Copy-Item .env.example .env
```

编辑 `.env`，填写测试 SKU。`.env` 和浏览器登录会话均已被 Git 忽略。

## 第一次登录

```powershell
npm run auth
```

Chrome 打开后，手动输入账号、密码和 MFA。程序检测到 Inventory 页面后会自动保存本地会话并退出。

## 加密保存自动登录凭据

凭据使用 Windows DPAPI 加密，只能由保存凭据的同一个 Windows 用户解密。密码不会写入 `.env`、任务参数或日志。

```powershell
npm run credentials -- -UserName YOUR-EMAIL
```

按提示输入密码。可以用以下命令验证后台登录，不会更新 SKU：

```powershell
npm run check:login
```

## 安全预演

```powershell
npm run run -- --sku YOUR-SKU
```

预演会搜索、核对、勾选商品并打开更新表单，然后点击 `Cancel`，不会保存。

## 真实更新

先在 `.env` 中设置：

```dotenv
RITHUM_ALLOW_COMMIT=true
```

然后执行：

```powershell
npm run run -- --sku YOUR-SKU --commit
```

真实更新必须同时具备环境开关和 `--commit` 参数，避免误运行。失败截图保存在 `logs/`。

## 逐个更新全部 SKU

该命令会先读取 Inventory 当前全部结果，然后逐个执行“勾选白框 → Update Item Inventory → Save Changes”。每个 SKU 完成后立即写入日志；单个 SKU 失败时记录错误并继续。

```powershell
$env:RITHUM_ALLOW_COMMIT='true'
npm run run:all -- --commit
```

日志保存在 `logs/rithum-auto-*.log`，每行格式为：

```text
时间 + 信息 + 操作
```

## 极简 GUI

确认 `.env` 中已经设置 `RITHUM_ALLOW_COMMIT=true`，然后运行：

```powershell
npm run gui
```

浏览器会打开 `http://127.0.0.1:3930`。GUI 只提供两个按钮：

- **A · 全部 Save Changes**：自动登录当前账号，遍历全部 Inventory，并逐个执行 Save Changes。同一时间只允许一个批量任务运行。
- **B · 查看所有日志**：读取并展示 `logs/` 中全部 `.log` 文件，包括历史记录；再次点击会刷新日志。

GUI 仅监听本机地址，账号和密码不会发送到页面。关闭页面不会中断已经启动的批量任务；停止 GUI 请在终端按 `Ctrl+C`。

## Windows 桌面软件

开发模式启动独立桌面窗口：

```powershell
npm run desktop
```

生成 Windows x64 安装包和便携版 EXE：

```powershell
npm run dist:win
```

构建结果保存在 `release/`。安装版会创建桌面和开始菜单快捷方式；便携版可以直接双击运行。桌面软件仍只有 A（更新全部 Inventory）和 B（查看全部日志）两个主要功能，并会实时显示当前 SKU 和完成进度。

软件数据保存在当前 Windows 用户的 RithumAuto 应用数据目录。首次缺少凭据时，点击 A 会要求输入账号和密码；凭据由 Electron `safeStorage` 调用 Windows DPAPI 加密，不会写入源码、日志或安装包。
