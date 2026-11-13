import { useState, useCallback, useEffect, useRef, DragEvent } from 'react';
import { useViewerStore } from '../lib/store';
import { loadDicomFromFolder, isPotentialDicomFile, registerInMemoryFile, clearInMemoryFiles } from '../lib/dicom';
import { unzipSync } from 'fflate';

export default function Dashboard() {
  const [isDragging, setIsDragging] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const setLoading = useViewerStore((s) => s.setLoading);
  const updateLoadingProgress = useViewerStore((s) => s.updateLoadingProgress);
  const setError = useViewerStore((s) => s.setError);
  const setStudy = useViewerStore((s) => s.setStudy);
  const settings = useViewerStore((s) => s.settings);

  // Handle opening folder
  const handleOpenFolder = useCallback(async () => {
    if (window.electronAPI) {
      try {
        setLoading(true, { phase: 'scanning', current: 0, total: 0, message: 'Opening folder...' });

        const result = await window.electronAPI.openDicomFolder();
        if (!result) {
          setLoading(false);
          return;
        }

        const study = await loadDicomFromFolder(result.files, updateLoadingProgress);

        if (study) {
          setStudy(study);
        } else {
          setError('No DICOM files found in this folder.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open folder');
      } finally {
        setLoading(false);
      }
    } else {
      // Browser mode: trigger folder file input
      folderInputRef.current?.click();
    }
  }, [setLoading, updateLoadingProgress, setError, setStudy]);

  // Handle opening ZIP
  const handleOpenZip = useCallback(async () => {
    if (window.electronAPI) {
      try {
        setLoading(true, { phase: 'extracting', current: 0, total: 0, message: 'Extracting ZIP...' });

        const result = await window.electronAPI.openDicomZip();
        if (!result) {
          setLoading(false);
          return;
        }

        // ZIP is already extracted in main process, just load the files
        const study = await loadDicomFromFolder(result.files, updateLoadingProgress);

        if (study) {
          setStudy(study);
        } else {
          setError('No DICOM files found in this ZIP archive.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open ZIP');
      } finally {
        setLoading(false);
      }
    } else {
      // Browser mode: trigger ZIP file input
      zipInputRef.current?.click();
    }
  }, [setLoading, updateLoadingProgress, setError, setStudy]);

  // Browser folder input change handler
  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    try {
      setLoading(true, { phase: 'scanning', current: 0, total: fileList.length, message: 'Scanning files...' });

      clearInMemoryFiles();
      const validPaths: string[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (isPotentialDicomFile(file.name)) {
          const path = file.webkitRelativePath || file.name;
          registerInMemoryFile(path, file);
          validPaths.push(path);
        }
      }

      if (validPaths.length === 0) {
        setError('No DICOM files found in the selected folder.');
        setLoading(false);
        return;
      }

      const study = await loadDicomFromFolder(validPaths, updateLoadingProgress);
      if (study) {
        setStudy(study);
      } else {
        setError('No valid DICOM medical images found in this folder.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process folder');
    } finally {
      setLoading(false);
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  // Browser ZIP input change handler
  const handleZipInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true, { phase: 'extracting', current: 0, total: 0, message: 'Extracting ZIP archive...' });

      const arrayBuffer = await file.arrayBuffer();
      const extracted = unzipSync(new Uint8Array(arrayBuffer));

      clearInMemoryFiles();
      const validPaths: string[] = [];

      for (const [filePath, data] of Object.entries(extracted)) {
        if (filePath.endsWith('/') || filePath.includes('__MACOSX/')) continue;
        const fileName = filePath.split('/').pop() || filePath;
        if (isPotentialDicomFile(fileName)) {
          registerInMemoryFile(filePath, data);
          validPaths.push(filePath);
        }
      }

      if (validPaths.length === 0) {
        setError('No DICOM files found in this ZIP archive.');
        setLoading(false);
        return;
      }

      const study = await loadDicomFromFolder(validPaths, updateLoadingProgress);
      if (study) {
        setStudy(study);
      } else {
        setError('No valid DICOM medical images found in this ZIP archive.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract ZIP archive');
    } finally {
      setLoading(false);
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // If running in Electron with native file access available
    if (window.electronAPI) {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        try {
          const firstFile = files[0];
          const filePath = window.electronAPI.getPathForFile
            ? window.electronAPI.getPathForFile(firstFile)
            : (firstFile as unknown as { path?: string }).path;

          if (filePath) {
            setLoading(true, { phase: 'scanning', current: 0, total: 0, message: 'Opening dropped file...' });

            const result = await window.electronAPI.openPath(filePath);
            if (!result || result.files.length === 0) {
              setError('No DICOM files found in the dropped item.');
              setLoading(false);
              return;
            }

            const study = await loadDicomFromFolder(result.files, updateLoadingProgress);
            if (study) {
              setStudy(study);
            } else {
              setError('No valid DICOM medical images could be parsed.');
            }
            setLoading(false);
            return;
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to open dropped file');
          setLoading(false);
          return;
        }
      }
    }

    // Web browser mode (or Electron fallback without native path)
    const items = e.dataTransfer?.items;
    const files = e.dataTransfer?.files;

    if (!files || files.length === 0) return;

    try {
      // Check if a single ZIP file was dropped
      if (files.length === 1 && (files[0].name.toLowerCase().endsWith('.zip') || files[0].type.includes('zip'))) {
        setLoading(true, { phase: 'extracting', current: 0, total: 0, message: 'Extracting dropped ZIP archive...' });

        const arrayBuf = await files[0].arrayBuffer();
        const extracted = unzipSync(new Uint8Array(arrayBuf));

        clearInMemoryFiles();
        const validPaths: string[] = [];

        for (const [filePath, data] of Object.entries(extracted)) {
          if (filePath.endsWith('/') || filePath.includes('__MACOSX/')) continue;
          const fileName = filePath.split('/').pop() || filePath;
          if (isPotentialDicomFile(fileName)) {
            registerInMemoryFile(filePath, data);
            validPaths.push(filePath);
          }
        }

        if (validPaths.length === 0) {
          setError('No DICOM files found in this ZIP archive.');
          setLoading(false);
          return;
        }

        const study = await loadDicomFromFolder(validPaths, updateLoadingProgress);
        if (study) setStudy(study);
        else setError('No valid DICOM medical images found in this ZIP archive.');
        setLoading(false);
        return;
      }

      // Handle dropped folder or list of files via HTML5 directory entry traversal
      setLoading(true, { phase: 'scanning', current: 0, total: 0, message: 'Processing dropped files...' });
      const droppedFiles: File[] = [];

      interface WebkitEntry {
        isFile: boolean;
        isDirectory: boolean;
        name: string;
        file: (success: (f: File) => void, error?: () => void) => void;
        createReader: () => {
          readEntries: (success: (entries: WebkitEntry[]) => void, error?: () => void) => void;
        };
      }

      if (items && items.length > 0 && typeof (items[0] as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry === 'function') {
        const queue: WebkitEntry[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = (items[i] as unknown as { webkitGetAsEntry: () => WebkitEntry | null }).webkitGetAsEntry();
          if (entry) queue.push(entry);
        }

        const readEntry = async (entry: WebkitEntry, currentPath = '') => {
          if (entry.isFile) {
            await new Promise<void>((resolve) => {
              entry.file((file: File) => {
                const relativePath = currentPath ? `${currentPath}/${file.name}` : file.name;
                Object.defineProperty(file, 'webkitRelativePath', { value: relativePath, configurable: true });
                droppedFiles.push(file);
                resolve();
              }, () => resolve());
            });
          } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const readEntries = async () => {
              const entries: WebkitEntry[] = await new Promise((resolve) => dirReader.readEntries(resolve, () => resolve([])));
              if (entries.length > 0) {
                for (const child of entries) {
                  await readEntry(child, currentPath ? `${currentPath}/${entry.name}` : entry.name);
                }
                await readEntries();
              }
            };
            await readEntries();
          }
        };

        for (const entry of queue) {
          await readEntry(entry);
        }
      } else {
        for (let i = 0; i < files.length; i++) {
          droppedFiles.push(files[i]);
        }
      }

      clearInMemoryFiles();
      const validPaths: string[] = [];

      for (const file of droppedFiles) {
        if (isPotentialDicomFile(file.name)) {
          const path = file.webkitRelativePath || file.name;
          registerInMemoryFile(path, file);
          validPaths.push(path);
        }
      }

      if (validPaths.length === 0) {
        setError('No DICOM files found in the dropped item.');
        setLoading(false);
        return;
      }

      const study = await loadDicomFromFolder(validPaths, updateLoadingProgress);
      if (study) setStudy(study);
      else setError('No valid DICOM medical images could be parsed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process dropped files');
    } finally {
      setLoading(false);
    }
  }, [setLoading, updateLoadingProgress, setError, setStudy]);

  // Listen for menu actions
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleMenuAction = (action: string) => {
      switch (action) {
        case 'open-folder':
          handleOpenFolder();
          break;
        case 'open-zip':
          handleOpenZip();
          break;
      }
    };

    const unsubscribe = window.electronAPI.onMenuAction(handleMenuAction);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [handleOpenFolder, handleOpenZip]);

  return (
    <div
      className={`flex-1 flex items-center justify-center transition-colors duration-200 ${
        isDragging ? 'bg-accent/10' : 'bg-viewer-bg'
      }`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="text-center max-w-md px-6">
        {/* Medical imaging icon */}
        <div className="mb-8">
          <svg
            className="w-24 h-24 mx-auto text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M12 3v6a1 1 0 001 1h6"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-semibold text-white mb-3">MRI Reader</h1>

        {/* Description */}
        <p className="text-gray-400 mb-8 leading-relaxed">
          View your medical imaging files privately on your computer.
          {!settings.expertMode && ' No internet required.'}
        </p>

        {/* Hidden inputs for browser file selection */}
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard in browsers but non-standard TS attribute
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={handleFolderInputChange}
        />
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={handleZipInputChange}
        />

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={handleOpenFolder}
            className="w-full py-4 px-6 bg-accent hover:bg-accent-hover text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            {settings.expertMode ? 'Open DICOM Folder' : 'Open Folder'}
          </button>

          <button
            onClick={handleOpenZip}
            className="w-full py-4 px-6 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Open ZIP Archive
          </button>
        </div>

        {/* Keyboard shortcut hints */}
        <p className="text-gray-500 text-sm mt-6">
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-xs">⌘O</kbd>
            <span>Open Folder</span>
          </span>
          <span className="mx-2">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-xs">⇧⌘O</kbd>
            <span>Open ZIP</span>
          </span>
        </p>

        {/* Privacy note */}
        <p className="text-gray-600 text-xs mt-8">
          Your medical images never leave your computer.
          <br />
          All processing happens locally.
        </p>
      </div>
    </div>
  );
}
