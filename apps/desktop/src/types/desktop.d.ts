import type * as React from "react";

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

interface DesktopPrinterInfo {
  name: string;
  deviceUri: string | null;
}

interface DesktopPrinterSettings {
  enabled: boolean;
  autoPrint: boolean;
  printerName: string | null;
  paperWidth: number;
  printers: DesktopPrinterInfo[];
  printerAvailable: boolean;
  printerState: string;
  printerMessage: string;
}

interface MosaicoDesktopBridge {
  getConnectionStatus: () => Promise<DesktopConnectionStatus>;
  getBackendUrl: () => Promise<string>;
  getBackendDiagnostic: () => Promise<DesktopBackendDiagnostic>;
  showWhatsApp: (accountId: string) => Promise<{ ready: boolean }>;
  setWhatsAppBounds: (bounds: { left: number; top: number; width: number; height: number; viewportWidth?: number; viewportHeight?: number }) => void;
  hideWhatsApp: () => Promise<void>;
  reloadWhatsApp: () => Promise<void>;
  onWhatsAppStatus?: (listener: (payload: { state: string; message: string }) => void) => (() => void) | void;
  createNewDatabase: () => Promise<{ archivePath: string | null }>;
  transcribeAudio: (audio: ArrayBuffer, mimeType: string, prompt?: string) => Promise<{ available: boolean; text: string | null; understood: boolean }>;
  interpretText: (text: string, products: { name: string; aliases: string[] }[]) => Promise<{ available: boolean; text: string | null; understood: boolean }>;
  getPlatform: () => string;
  chooseBackupFolder: () => Promise<{ folder: string | null; lastBackupAt: string | null } | null>;
  getBackupSettings: () => Promise<{ folder: string | null; lastBackupAt: string | null }>;
  writeBackupFile: (input: { folder: string; content: string }) => Promise<{ path: string; createdAt: string }>;
  readBackupFile: () => Promise<{ path: string; content: string } | null>;
  getPrinterSettings: () => Promise<DesktopPrinterSettings>;
  savePrinterSettings: (input: { enabled: boolean; autoPrint: boolean; printerName: string | null }) => Promise<DesktopPrinterSettings>;
  testPrinter: () => Promise<{ jobId: string | null; printerName: string }>;
  printFoodOrder: (order: unknown) => Promise<{ jobId: string | null; printerName: string }>;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
  }
  }

  interface Window {
    mosaicoDesktop?: MosaicoDesktopBridge;
  }
}

export {};
