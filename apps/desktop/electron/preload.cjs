const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("mosaicoDesktop", {
  getConnectionStatus: async () => {
    const defaultBackendUrl = "https://mosaico.rotatix.com.br";
    const backendUrl = process.env.MOSAICO_BACKEND_URL || defaultBackendUrl;

    try {
      const response = await fetch(`${backendUrl}/api/health`);
      const payload = await response.json();

      if (response.ok && payload?.data?.status === "ok") {
        return {
          state: "online",
          label: "Backend conectado",
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
  getPlatform: () => process.platform,
});
