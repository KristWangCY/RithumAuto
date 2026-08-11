import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { readAllLogs } from "./logs.js";
import {
  getRunStatus,
  isRunActive,
  startManagedInventoryUpdate,
} from "./run-manager.js";

const HOST = "127.0.0.1";
const PORT = readPort(process.env.RITHUM_GUI_PORT, 3930);
const GUI_TOKEN = randomBytes(32).toString("hex");

const server = createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 500, { error: `GUI 处理失败：${message}` });
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`RithumAuto GUI 已启动：${url}`);
  console.log("按 Ctrl+C 可停止 GUI。关闭页面不会中断正在进行的批量任务。");
  if (process.env.RITHUM_GUI_OPEN !== "false") {
    openBrowser(url);
  }
});

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);

  if (request.method === "GET" && url.pathname === "/") {
    sendHtml(response, renderPage(GUI_TOKEN));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, getRunStatus());
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/logs") {
    sendJson(response, 200, { logs: await readAllLogs() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/update-all") {
    request.resume();
    if (!isAuthorizedGuiRequest(request)) {
      sendJson(response, 403, { error: "请求未通过本地 GUI 验证。" });
      return;
    }
    if (isRunActive()) {
      sendJson(response, 409, {
        error: "批量更新已在运行中。",
        status: getRunStatus(),
      });
      return;
    }

    try {
      const nextStatus = startManagedInventoryUpdate();
      sendJson(response, 202, { status: nextStatus });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, 412, { error: message });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

function isAuthorizedGuiRequest(request: IncomingMessage): boolean {
  const expectedOrigin = `http://${HOST}:${PORT}`;
  return (
    request.headers.origin === expectedOrigin &&
    request.headers["x-rithum-gui-token"] === GUI_TOKEN
  );
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function sendHtml(response: ServerResponse, html: string): void {
  const nonce = extractNonce(html);
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "img-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
    "Content-Type": "text/html; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(html);
}

function renderPage(token: string): string {
  const nonce = randomBytes(18).toString("base64");
  return `<!doctype html>
<html lang="zh-CN" data-nonce="${nonce}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RithumAuto</title>
  <style nonce="${nonce}">
    :root { color-scheme: light; font-family: Inter, "Segoe UI", sans-serif; background: #f5f6f8; color: #1d2433; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px 18px; }
    main { width: min(820px, 100%); }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 5vw, 42px); letter-spacing: -0.04em; }
    .subtitle { margin: 0 0 28px; color: #667085; }
    .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    button { min-height: 94px; border: 0; border-radius: 18px; padding: 18px; cursor: pointer; font: inherit; font-size: 17px; font-weight: 700; transition: transform .15s ease, opacity .15s ease; }
    button:hover:not(:disabled) { transform: translateY(-2px); }
    button:focus-visible { outline: 3px solid #9dc1ff; outline-offset: 3px; }
    button:disabled { cursor: wait; opacity: .55; }
    #run { background: #176bff; color: white; box-shadow: 0 12px 30px rgba(23, 107, 255, .22); }
    #logs { background: white; color: #1d2433; border: 1px solid #e4e7ec; }
    #status { margin: 18px 0 0; min-height: 52px; padding: 14px 16px; background: white; border: 1px solid #e4e7ec; border-radius: 14px; color: #475467; line-height: 1.5; }
    #status[data-state="running"] { color: #175cd3; border-color: #b2ccff; }
    #status[data-state="success"] { color: #067647; border-color: #abefc6; }
    #status[data-state="failed"] { color: #b42318; border-color: #fecdca; }
    #log-view { margin-top: 18px; }
    .log { margin-top: 12px; overflow: hidden; border: 1px solid #e4e7ec; border-radius: 14px; background: white; }
    .log h2 { margin: 0; padding: 12px 16px; font-size: 14px; color: #344054; border-bottom: 1px solid #e4e7ec; }
    pre { margin: 0; padding: 16px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.6 Consolas, monospace; color: #344054; background: #fcfcfd; }
    .empty { padding: 18px; background: white; border: 1px solid #e4e7ec; border-radius: 14px; color: #667085; }
    @media (max-width: 560px) { .actions { grid-template-columns: 1fr; } button { min-height: 76px; } }
  </style>
</head>
<body>
  <main>
    <h1>RithumAuto</h1>
    <p class="subtitle">全部保存，或查看完整运行记录。</p>
    <div class="actions">
      <button id="run" type="button">A · 全部 Save Changes</button>
      <button id="logs" type="button">B · 查看所有日志</button>
    </div>
    <div id="status" role="status" aria-live="polite">正在读取状态…</div>
    <section id="log-view" aria-label="历史日志" hidden></section>
  </main>
  <script nonce="${nonce}">
    const token = ${JSON.stringify(token)};
    const runButton = document.querySelector("#run");
    const logsButton = document.querySelector("#logs");
    const statusBox = document.querySelector("#status");
    const logView = document.querySelector("#log-view");
    let pollTimer;

    function showStatus(status) {
      statusBox.dataset.state = status.state;
      statusBox.textContent = status.message;
      runButton.disabled = status.state === "running";
      if (status.state === "running") {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(loadStatus, 2000);
      }
    }

    async function loadStatus() {
      try {
        const response = await fetch("/api/status", { cache: "no-store" });
        showStatus(await response.json());
      } catch (error) {
        statusBox.dataset.state = "failed";
        statusBox.textContent = "无法读取运行状态：" + error.message;
        runButton.disabled = false;
      }
    }

    runButton.addEventListener("click", async () => {
      runButton.disabled = true;
      statusBox.dataset.state = "running";
      statusBox.textContent = "正在启动批量更新…";
      try {
        const response = await fetch("/api/update-all", {
          method: "POST",
          headers: { "X-Rithum-Gui-Token": token },
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "启动失败");
        showStatus(body.status);
      } catch (error) {
        statusBox.dataset.state = "failed";
        statusBox.textContent = error.message;
        runButton.disabled = false;
      }
    });

    logsButton.addEventListener("click", async () => {
      logsButton.disabled = true;
      logView.hidden = false;
      logView.replaceChildren(Object.assign(document.createElement("div"), {
        className: "empty",
        textContent: "正在读取全部日志…",
      }));
      try {
        const response = await fetch("/api/logs", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "读取失败");
        logView.replaceChildren();
        if (body.logs.length === 0) {
          logView.append(Object.assign(document.createElement("div"), {
            className: "empty",
            textContent: "还没有历史日志。",
          }));
        }
        for (const log of body.logs) {
          const article = document.createElement("article");
          article.className = "log";
          const heading = document.createElement("h2");
          heading.textContent = log.name + " · " + new Date(log.updatedAt).toLocaleString();
          const content = document.createElement("pre");
          content.textContent = log.content || "（空日志）";
          article.append(heading, content);
          logView.append(article);
        }
      } catch (error) {
        logView.replaceChildren(Object.assign(document.createElement("div"), {
          className: "empty",
          textContent: "日志读取失败：" + error.message,
        }));
      } finally {
        logsButton.disabled = false;
      }
    });

    loadStatus();
  </script>
</body>
</html>`;
}

function extractNonce(html: string): string {
  const match = html.match(/<html[^>]+data-nonce="([^"]+)"/);
  if (!match?.[1]) throw new Error("无法生成页面安全令牌。");
  return match[1];
}

function openBrowser(url: string): void {
  const commands: Record<string, [string, string[]]> = {
    win32: ["cmd.exe", ["/d", "/s", "/c", "start", "", url]],
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
  };
  const command = commands[process.platform];
  if (!command) return;
  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function readPort(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const port = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("RITHUM_GUI_PORT 必须是 1 到 65535 之间的整数。");
  }
  return port;
}
