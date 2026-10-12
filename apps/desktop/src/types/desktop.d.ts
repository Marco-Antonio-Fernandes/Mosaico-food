type DesktopConnectionState = "unknown" | "online" | "offline";

interface DesktopConnectionStatus {
  state: DesktopConnectionState;
  label: string;
}

interface MosaicoDesktopBridge {
  getConnectionStatus: () => Promise<DesktopConnectionStatus>;
  getBackendUrl: () => Promise<string>;
  transcribeAudio: (audio: ArrayBuffer, mimeType: string, prompt?: string) => Promise<{ available: boolean; text: string | null; understood: boolean }>;
  interpretText: (text: string, products: { name: string; aliases: string[] }[]) => Promise<{ available: boolean; text: string | null; understood: boolean }>;
  getPlatform: () => string;
}

declare global {
  interface Window {
    mosaicoDesktop?: MosaicoDesktopBridge;
  }
}

export {};
