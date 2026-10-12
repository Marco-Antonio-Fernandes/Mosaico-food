const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mosaicoDesktop", {
  getConnectionStatus: async () => {
    const backendUrl = await ipcRenderer.invoke("mosaico:backend-url");

    try {
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
      return {
        state: "offline",
        label: "Backend indisponível",
      };
    }

    return {
      state: "unknown",
      label: "Backend não configurado",
    };
  },
  getBackendUrl: () => ipcRenderer.invoke("mosaico:backend-url"),
  transcribeAudio: (audio, mimeType) => ipcRenderer.invoke("mosaico:transcribe-audio", audio, mimeType),
  getPlatform: () => process.platform,
});
