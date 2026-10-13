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
  transcribeAudio: (audio, mimeType, prompt) => ipcRenderer.invoke("mosaico:transcribe-audio", audio, mimeType, prompt),
  interpretText: (text, products) => ipcRenderer.invoke("mosaico:interpret-text", text, products),
  getPlatform: () => process.platform,
  chooseBackupFolder: () => ipcRenderer.invoke("mosaico:choose-backup-folder"),
  getBackupSettings: () => ipcRenderer.invoke("mosaico:get-backup-settings"),
  writeBackupFile: (input) => ipcRenderer.invoke("mosaico:write-backup-file", input),
  readBackupFile: () => ipcRenderer.invoke("mosaico:read-backup-file"),
});
