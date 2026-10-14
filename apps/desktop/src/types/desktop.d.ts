type DesktopConnectionState = "unknown" | "online" | "offline";

interface DesktopConnectionStatus {
  state: DesktopConnectionState;
  label: string;
}

interface DesktopBackendDiagnostic {
  running: boolean;
  url: string | null;
  error: string | null;
}

interface MosaicoDesktopBridge {
  getConnectionStatus: () => Promise<DesktopConnectionStatus>;
  getBackendUrl: () => Promise<string>;
  getBackendDiagnostic: () => Promise<DesktopBackendDiagnostic>;
  createNewDatabase: () => Promise<{ archivePath: string | null }>;
  transcribeAudio: (audio: ArrayBuffer, mimeType: string, prompt?: string) => Promise<{ available: boolean; text: string | null; understood: boolean }>;
  interpretText: (text: string, products: { name: string; aliases: string[] }[]) => Promise<{ available: boolean; text: string | null; understood: boolean }>;
  getPlatform: () => string;
  chooseBackupFolder: () => Promise<{ folder: string | null; lastBackupAt: string | null } | null>;
  getBackupSettings: () => Promise<{ folder: string | null; lastBackupAt: string | null }>;
  writeBackupFile: (input: { folder: string; content: string }) => Promise<{ path: string; createdAt: string }>;
  readBackupFile: () => Promise<{ path: string; content: string } | null>;
}

declare global {
  interface Window {
    mosaicoDesktop?: MosaicoDesktopBridge;
  }
}

export {};
