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

interface DesktopUpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  downloading: boolean;
  notes: string | null;
  publishedAt: string | null;
  manifestUrl: string;
}

interface DesktopUpdateProgress {
  received?: number;
  total?: number;
  percent: number | null;
  phase?: "downloading" | "verifying" | "extracting" | "installing";
}

interface MosaicoDesktopBridge {
  getConnectionStatus: () => Promise<DesktopConnectionStatus>;
  getBackendUrl: () => Promise<string>;
  getBackendDiagnostic: () => Promise<DesktopBackendDiagnostic>;
  createNewDatabase: () => Promise<{ archivePath: string | null }>;
  transcribeAudio: (audio: ArrayBuffer, mimeType: string, prompt?: string) => Promise<{ available: boolean; text: string | null; understood: boolean }>;
  interpretText: (text: string, products: { name: string; aliases: string[] }[]) => Promise<{ available: boolean; text: string | null; understood: boolean }>;
  getPlatform: () => string;
  getBackupSettings: () => Promise<{ lastBackupAt: string | null }>;
  saveBackupFile: (input: { content: string }) => Promise<{ path: string; createdAt: string } | null>;
  readBackupFile: () => Promise<{ path: string; content: string } | null>;
  getPrinterSettings: () => Promise<DesktopPrinterSettings>;
  savePrinterSettings: (input: { enabled: boolean; autoPrint: boolean; printerName: string | null }) => Promise<DesktopPrinterSettings>;
  testPrinter: () => Promise<{ jobId: string | null; printerName: string }>;
  printFoodOrder: (order: unknown) => Promise<{ jobId: string | null; printerName: string }>;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<DesktopUpdateStatus>;
  installUpdate: () => Promise<{ restarting: boolean }>;
  onUpdateProgress: (listener: (progress: DesktopUpdateProgress) => void) => () => void;
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
