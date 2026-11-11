const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mosaicoDesktop", {
  getConnectionStatus: async () => {
    try {
      const backendUrl = await ipcRenderer.invoke("mosaico:backend-url");
      const response = await fetch(`${backendUrl}/api/health`);
      const payload = await response.json();

      if (response.ok && payload?.data?.status === "ok") {
        return {
          state: "online",
          label: backendUrl.startsWith("http://127.0.0.1") ? "Food local" : "Backend conectado",
        };
      }

      if (response.ok && payload?.data?.status === "degraded") {
        return {
          state: "unknown",
          label: "Backend ativo, banco pendente",
        };
      }
    } catch {
      const diagnostic = await ipcRenderer.invoke("mosaico:backend-diagnostic").catch(() => null);
      return {
        state: "offline",
        label: diagnostic?.error ? `Backend local: ${diagnostic.error}` : "Backend local indisponível",
      };
    }

    return {
      state: "unknown",
      label: "Backend não configurado",
    };
  },
  getBackendUrl: () => ipcRenderer.invoke("mosaico:backend-url"),
  getBackendDiagnostic: () => ipcRenderer.invoke("mosaico:backend-diagnostic"),
  createNewDatabase: () => ipcRenderer.invoke("mosaico:create-new-database"),
  transcribeAudio: (audio, mimeType, prompt) => ipcRenderer.invoke("mosaico:transcribe-audio", audio, mimeType, prompt),
  getPlatform: () => process.platform,
  getBackupSettings: () => ipcRenderer.invoke("mosaico:get-backup-settings"),
  saveBackupFile: (input) => ipcRenderer.invoke("mosaico:save-backup-file", input),
  readBackupFile: () => ipcRenderer.invoke("mosaico:read-backup-file"),
  getPrinterSettings: () => ipcRenderer.invoke("mosaico:get-printer-settings"),
  savePrinterSettings: (input) => ipcRenderer.invoke("mosaico:save-printer-settings", input),
  testPrinter: () => ipcRenderer.invoke("mosaico:test-printer"),
  printFoodOrder: (order) => ipcRenderer.invoke("mosaico:print-food-order", order),
  showWhatsApp: (accountId) => ipcRenderer.invoke("mosaico:whatsapp-show", accountId),
  setWhatsAppBounds: (bounds) => ipcRenderer.send("mosaico:whatsapp-bounds", bounds),
  hideWhatsApp: () => ipcRenderer.invoke("mosaico:whatsapp-hide"),
  reloadWhatsApp: () => ipcRenderer.invoke("mosaico:whatsapp-reload"),
  onWhatsAppStatus: (listener) => {
    const receive = (_event, payload) => listener(payload);
    ipcRenderer.on("mosaico:whatsapp-status", receive);
    return () => ipcRenderer.removeListener("mosaico:whatsapp-status", receive);
  },
  getAppVersion: () => ipcRenderer.invoke("mosaico:app-version"),
  checkForUpdates: () => ipcRenderer.invoke("mosaico:check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("mosaico:install-update"),
  onUpdateProgress: (listener) => {
    const receive = (_event, progress) => listener(progress);
    ipcRenderer.on("mosaico:update-progress", receive);
    return () => ipcRenderer.removeListener("mosaico:update-progress", receive);
  },
});
