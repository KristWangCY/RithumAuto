const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rithumDesktop", {
  hasCredentials: () => ipcRenderer.invoke("credentials:has"),
  saveCredentials: (username, password) =>
    ipcRenderer.invoke("credentials:save", username, password),
  getRunStatus: () => ipcRenderer.invoke("run:status"),
  startUpdate: () => ipcRenderer.invoke("run:start"),
  getLogs: () => ipcRenderer.invoke("logs:list"),
  onRunStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("run:status-changed", listener);
    return () => ipcRenderer.removeListener("run:status-changed", listener);
  },
});
