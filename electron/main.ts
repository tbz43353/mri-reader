import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { readFile, writeFile, readdir, stat, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join, normalize, basename, sep, extname, dirname } from 'path';
import * as crypto from 'crypto';
import { unzipSync } from 'fflate';

// Note: Sandbox is enabled by default in Electron 33+
// Individual windows use sandbox: true in webPreferences for additional protection

// Track all open windows
const windows = new Set<BrowserWindow>();

// Security: Track allowed base paths (only user-selected directories)
const allowedBasePaths = new Set<string>();

// Secure temp directory for ZIP extraction
let TEMP_DIR: string;

// DICOM file extensions
const DICOM_EXTENSIONS = ['.dcm', '.dicom', '.ima'];

// Security limits for DICOM parsing
const DICOM_SECURITY = {
  maxFileSize: 500 * 1024 * 1024, // 500MB max per file
  maxFilesPerStudy: 10000,        // Max files in a study
  maxZipSize: 2 * 1024 * 1024 * 1024, // 2GB max ZIP size (to prevent memory issues)
};

// Helper: Format bytes to human-readable string
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function createWindow() {
  // Get icon path - use custom icon if available
  let iconPath: string | undefined;
  if (!app.isPackaged) {
    const devIconPath = join(__dirname, '..', 'build', 'icons', 'icon.png');
    if (existsSync(devIconPath)) {
      iconPath = devIconPath;
    }
  }

  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'MRI Reader',
    ...(iconPath && { icon: iconPath }),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,    // REQUIRED
      nodeIntegration: false,    // REQUIRED
      sandbox: true,             // Additional protection
      webSecurity: true,         // Prevent CORS bypass
    },
  });

  // Add to windows set
  windows.add(window);

  // Load the app
  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  if (isDev) {
    window.loadURL('http://localhost:5175');
    window.webContents.openDevTools();
  } else {
    const appPath = app.getAppPath();
    const indexPath = join(appPath, 'dist', 'index.html');

    window.webContents.once('did-finish-load', () => {
      if (app.isPackaged) {
        window.webContents.closeDevTools();
      }
    });

    window.loadFile(indexPath);
  }

  // Remove from set when closed
  window.on('closed', () => {
    windows.delete(window);
  });

  return window;
}

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open DICOM Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-open-folder');
            }
          },
        },
        {
          label: 'Open ZIP Archive...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-open-zip');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Close Study',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-close-study');
            }
          },
        },
        { type: 'separator' },
        {
          role: 'quit',
          label: 'Quit',
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reset View',
          accelerator: 'R',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('menu-reset-view');
            }
          },
        },
        { type: 'separator' },
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force Reload' },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Cmd+Option+I' : 'Ctrl+Shift+I',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.toggleDevTools();
            }
          },
        },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Actual Size' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Full Screen' },
      ],
    },
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about', label: 'About ' + app.getName() },
        { type: 'separator' },
        { role: 'services', label: 'Services', submenu: [] },
        { type: 'separator' },
        { role: 'hide', label: 'Hide ' + app.getName() },
        { role: 'hideOthers', label: 'Hide Others' },
        { role: 'unhide', label: 'Show All' },
        { type: 'separator' },
        { role: 'quit', label: 'Quit ' + app.getName() },
      ],
    });

    // Window menu
    template.push({
      label: 'Window',
      submenu: [
        { role: 'close', label: 'Close' },
        { role: 'minimize', label: 'Minimize' },
        { role: 'zoom', label: 'Zoom' },
        { type: 'separator' },
        { role: 'front', label: 'Bring All to Front' },
      ],
    });

    // Help menu
    template.push({
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://github.com/tbz43353/mri-reader-app');
          },
        },
      ],
    });
  } else {
    // Windows/Linux: Add Help menu
    template.push({
      label: 'Help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://github.com/tbz43353/mri-reader-app');
          },
        },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Set app name
app.setName('MRI Reader');

app.whenReady().then(async () => {
  // Create secure temp directory
  TEMP_DIR = join(app.getPath('temp'), 'mri-reader-' + crypto.randomUUID());
  await mkdir(TEMP_DIR, { recursive: true });

  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up temp directory on quit
app.on('will-quit', async () => {
  try {
    if (TEMP_DIR && existsSync(TEMP_DIR)) {
      await rm(TEMP_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    console.error('Failed to clean temp directory:', e);
  }
});

// Helper: Recursively scan directory for DICOM files
async function scanForDicomFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentPath: string) {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        // Include files with DICOM extensions or no extension (common for DICOM)
        if (DICOM_EXTENSIONS.includes(ext) || ext === '') {
          files.push(fullPath);
        }
      }

      // Security: Limit total files
      if (files.length >= DICOM_SECURITY.maxFilesPerStudy) {
        break;
      }
    }
  }

  await scan(dirPath);
  return files;
}

// Helper: Validate path is within allowed directories
function isPathAllowed(filePath: string): boolean {
  const normalized = normalize(filePath);
  return [...allowedBasePaths].some(base => {
    const normalizedBase = normalize(base);
    return normalized.startsWith(normalizedBase + sep) || normalized === normalizedBase;
  });
}

// IPC Handlers

// Open folder dialog and scan for DICOM files
ipcMain.handle('open-dicom-folder', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return null;

  const result = await dialog.showOpenDialog(window, {
    properties: ['openDirectory'],
    title: 'Select DICOM Folder',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const folderPath = result.filePaths[0];

  // Add to allowed paths
  allowedBasePaths.add(folderPath);

  // Scan for DICOM files
  const files = await scanForDicomFiles(folderPath);

  return {
    basePath: folderPath,
    files: files,
    fileCount: files.length,
  };
});

// Open ZIP dialog and extract directly in main process (avoids IPC memory issues)
ipcMain.handle('open-dicom-zip', async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return null;

  const result = await dialog.showOpenDialog(window, {
    filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
    properties: ['openFile'],
    title: 'Select DICOM ZIP Archive',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const zipPath = result.filePaths[0];

  // Check ZIP file size before attempting to load it
  const zipStat = await stat(zipPath);
  if (zipStat.size > DICOM_SECURITY.maxZipSize) {
    throw new Error(
      `ZIP file is too large (${formatBytes(zipStat.size)}). ` +
      `Maximum supported size is ${formatBytes(DICOM_SECURITY.maxZipSize)}. ` +
      `Try extracting the ZIP manually and using "Open Folder" instead.`
    );
  }

  // Create extraction directory in temp
  const extractDir = join(TEMP_DIR, 'extract-' + crypto.randomUUID());
  await mkdir(extractDir, { recursive: true });

  // Add extraction directory to allowed paths
  allowedBasePaths.add(extractDir);

  try {
    // Read and extract ZIP directly in main process
    const zipBuffer = await readFile(zipPath);
    const extracted = unzipSync(new Uint8Array(zipBuffer));

    const savedPaths: string[] = [];

    // Save extracted files
    for (const [filePath, data] of Object.entries(extracted)) {
      // Skip directories
      if (filePath.endsWith('/')) continue;

      // Check if it's a DICOM file
      const ext = extname(filePath).toLowerCase();
      if (!DICOM_EXTENSIONS.includes(ext) && ext !== '' && filePath.includes('.')) {
        continue; // Skip non-DICOM files
      }

      // Security: Prevent path traversal
      const normalized = normalize(filePath);
      if (normalized.startsWith('..')) {
        console.warn(`Skipping unsafe path: ${filePath}`);
        continue;
      }

      const fullPath = join(extractDir, normalized);

      // Ensure path stays within extract dir
      if (!fullPath.startsWith(extractDir)) {
        console.warn(`Skipping path traversal attempt: ${filePath}`);
        continue;
      }

      // Create directory if needed
      const dir = dirname(fullPath);
      await mkdir(dir, { recursive: true });

      // Write file
      await writeFile(fullPath, data);
      savedPaths.push(fullPath);

      // Security: Limit total files
      if (savedPaths.length >= DICOM_SECURITY.maxFilesPerStudy) {
        break;
      }
    }

    return {
      basePath: extractDir,
      files: savedPaths,
      fileCount: savedPaths.length,
    };
  } catch (err) {
    console.error('Failed to extract ZIP:', err);
    // Clean up on failure
    try {
      await rm(extractDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Provide user-friendly error messages
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (errorMessage.includes('out of memory') ||
        errorMessage.includes('allocation failed') ||
        errorMessage.includes('Cannot allocate') ||
        errorMessage.includes('ENOMEM')) {
      throw new Error(
        'Not enough memory to extract this ZIP file. ' +
        'Try closing other applications, or extract the ZIP manually and use "Open Folder" instead.'
      );
    }

    if (errorMessage.includes('invalid zip') || errorMessage.includes('Invalid')) {
      throw new Error('This file does not appear to be a valid ZIP archive.');
    }

    // Re-throw original error if not a known case
    throw err;
  }
});

// Read a single file (for DICOM loading)
ipcMain.handle('read-file', async (_event, filePath: string) => {
  // Security: Validate path is within allowed directories
  if (!isPathAllowed(filePath)) {
    throw new Error('Access denied: path not in allowed directories');
  }

  // Security: Check file size
  const fileStat = await stat(filePath);
  if (fileStat.size > DICOM_SECURITY.maxFileSize) {
    throw new Error('File exceeds maximum allowed size');
  }

  const buffer = await readFile(filePath);
  return buffer;
});

// Get file info without reading content
ipcMain.handle('get-file-info', async (_event, filePath: string) => {
  if (!isPathAllowed(filePath)) {
    throw new Error('Access denied: path not in allowed directories');
  }

  const fileStat = await stat(filePath);
  return {
    size: fileStat.size,
    name: basename(filePath),
    path: filePath,
  };
});
