const api = window.rithumDesktop;
const runButton = document.querySelector("#run");
const logsButton = document.querySelector("#logs");
const statusCard = document.querySelector("#status-card");
const statusText = document.querySelector("#status");
const progressWrap = document.querySelector("#progress-wrap");
const progressBar = document.querySelector("#progress-bar");
const progressLabel = document.querySelector("#progress-label");
const logView = document.querySelector("#log-view");
const credentialsDialog = document.querySelector("#credentials-dialog");
const credentialsForm = document.querySelector("#credentials-form");
const usernameInput = document.querySelector("#username");
const passwordInput = document.querySelector("#password");
const credentialsError = document.querySelector("#credentials-error");

function showStatus(status) {
  statusCard.dataset.state = status.state;
  statusText.textContent = status.message;
  runButton.disabled = status.state === "running";

  const hasProgress = status.total !== null && status.total > 0;
  progressWrap.hidden = !hasProgress;
  if (hasProgress) {
    const percent = Math.min(100, Math.round((status.completed / status.total) * 100));
    progressBar.style.width = `${percent}%`;
    progressLabel.textContent = `${status.completed}/${status.total}`;
  }
}

async function startUpdate() {
  runButton.disabled = true;
  try {
    if (!(await api.hasCredentials())) {
      credentialsDialog.showModal();
      usernameInput.focus();
      return;
    }
    showStatus(await api.startUpdate());
  } catch (error) {
    showLocalError(error);
  } finally {
    if (statusCard.dataset.state !== "running") runButton.disabled = false;
  }
}

runButton.addEventListener("click", startUpdate);

logsButton.addEventListener("click", async () => {
  logsButton.disabled = true;
  logView.hidden = false;
  showLogMessage("正在读取全部日志…");
  try {
    const logs = await api.getLogs();
    logView.replaceChildren();
    if (logs.length === 0) {
      showLogMessage("还没有历史日志。");
    }
    for (const log of logs) {
      const article = document.createElement("article");
      article.className = "log";
      const heading = document.createElement("h2");
      heading.textContent = `${log.name} · ${new Date(log.updatedAt).toLocaleString()}`;
      const content = document.createElement("pre");
      content.textContent = log.content || "（空日志）";
      article.append(heading, content);
      logView.append(article);
    }
  } catch (error) {
    showLogMessage(`日志读取失败：${errorMessage(error)}`);
  } finally {
    logsButton.disabled = false;
  }
});

credentialsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  credentialsError.textContent = "";
  const submitButton = credentialsForm.querySelector("button");
  submitButton.disabled = true;
  try {
    await api.saveCredentials(usernameInput.value, passwordInput.value);
    passwordInput.value = "";
    credentialsDialog.close();
    showStatus(await api.startUpdate());
  } catch (error) {
    credentialsError.textContent = errorMessage(error);
  } finally {
    submitButton.disabled = false;
  }
});

credentialsDialog.addEventListener("cancel", () => {
  passwordInput.value = "";
  runButton.disabled = false;
});

function showLocalError(error) {
  statusCard.dataset.state = "failed";
  statusText.textContent = errorMessage(error);
}

function showLogMessage(message) {
  logView.replaceChildren(Object.assign(document.createElement("div"), {
    className: "empty",
    textContent: message,
  }));
}

function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': Error: /, "");
}

api.onRunStatus(showStatus);
api.getRunStatus().then(showStatus).catch(showLocalError);
