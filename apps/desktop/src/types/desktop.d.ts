type DesktopConnectionState = "unknown" | "online" | "offline";

interface DesktopConnectionStatus {
  state: DesktopConnectionState;
  label: string;
}

interface MosaicoDesktopBridge {
  getConnectionStatus: () => Promise<DesktopConnectionStatus>;
  getPlatform: () => string;
}

declare global {
  interface Window {
    mosaicoDesktop?: MosaicoDesktopBridge;
  }
}

export {};
