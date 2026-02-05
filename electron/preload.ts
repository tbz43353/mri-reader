import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openDicomFolder: () => ipcRenderer.invoke('open-dicom-folder'),
  openDicomZip: () => ipcRenderer.invoke('open-dicom-zip'),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  getFileInfo: (filePath: string) => ipcRenderer.invoke('get-file-info', filePath),

  // Menu event listeners
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu-open-folder', () => callback('open-folder'));
    ipcRenderer.on('menu-open-zip', () => callback('open-zip'));
    ipcRenderer.on('menu-close-study', () => callback('close-study'));
    ipcRenderer.on('menu-reset-view', () => callback('reset-view'));
  },
  removeMenuListeners: () => {
    ipcRenderer.removeAllListeners('menu-open-folder');
    ipcRenderer.removeAllListeners('menu-open-zip');
    ipcRenderer.removeAllListeners('menu-close-study');
    ipcRenderer.removeAllListeners('menu-reset-view');
  },
});

// Type definitions for TypeScript
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

declare global {
  interface Window {
    electronAPI: {
      openDicomFolder: () => Promise<DicomScanResult | null>;
      openDicomZip: () => Promise<DicomScanResult | null>;
      readFile: (filePath: string) => Promise<Buffer>;
      getFileInfo: (filePath: string) => Promise<FileInfo>;
      onMenuAction: (callback: (action: string) => void) => void;
      removeMenuListeners: () => void;
    };
  }
}
