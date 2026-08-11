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
