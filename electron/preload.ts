import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openDicomFolder: () => ipcRenderer.invoke('open-dicom-folder'),
  openDicomZip: () => ipcRenderer.invoke('open-dicom-zip'),
  openPath: (filePath: string) => ipcRenderer.invoke('open-path', filePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  getFileInfo: (filePath: string) => ipcRenderer.invoke('get-file-info', filePath),

  // Menu event listeners (returns an unsubscribe function to prevent listener collisions)
  onMenuAction: (callback: (action: string) => void) => {
    const onFolder = () => callback('open-folder');
    const onZip = () => callback('open-zip');
    const onClose = () => callback('close-study');
    const onReset = () => callback('reset-view');

    ipcRenderer.on('menu-open-folder', onFolder);
    ipcRenderer.on('menu-open-zip', onZip);
    ipcRenderer.on('menu-close-study', onClose);
    ipcRenderer.on('menu-reset-view', onReset);

    return () => {
      ipcRenderer.removeListener('menu-open-folder', onFolder);
      ipcRenderer.removeListener('menu-open-zip', onZip);
      ipcRenderer.removeListener('menu-close-study', onClose);
      ipcRenderer.removeListener('menu-reset-view', onReset);
    };
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
      openPath: (filePath: string) => Promise<DicomScanResult | null>;
      getPathForFile: (file: File) => string;
      readFile: (filePath: string) => Promise<Uint8Array | Buffer | ArrayBuffer>;
      getFileInfo: (filePath: string) => Promise<FileInfo>;
      onMenuAction: (callback: (action: string) => void) => (() => void);
      removeMenuListeners: () => void;
    };
  }
}
