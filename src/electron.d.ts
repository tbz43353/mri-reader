// Type definitions for Electron API exposed via preload

export interface DicomScanResult {
  basePath: string;
  files: string[];
  fileCount: number;
}

export interface FileInfo {
  size: number;
  name: string;
  path: string;
}

export interface ElectronAPI {
  openDicomFolder: () => Promise<DicomScanResult | null>;
  openDicomZip: () => Promise<DicomScanResult | null>;
  openPath: (filePath: string) => Promise<DicomScanResult | null>;
  getPathForFile: (file: File) => string;
  readFile: (filePath: string) => Promise<Uint8Array | Buffer | ArrayBuffer>;
  getFileInfo: (filePath: string) => Promise<FileInfo>;
  onMenuAction: (callback: (action: string) => void) => (() => void);
  removeMenuListeners: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
