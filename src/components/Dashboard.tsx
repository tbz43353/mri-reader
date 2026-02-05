import { useState, useCallback, useEffect, DragEvent } from 'react';
import { useViewerStore } from '../lib/store';
import { loadDicomFromFolder } from '../lib/dicom';

export default function Dashboard() {
  const [isDragging, setIsDragging] = useState(false);
  const setLoading = useViewerStore((s) => s.setLoading);
  const updateLoadingProgress = useViewerStore((s) => s.updateLoadingProgress);
  const setError = useViewerStore((s) => s.setError);
  const setStudy = useViewerStore((s) => s.setStudy);
  const settings = useViewerStore((s) => s.settings);

  // Handle opening folder
  const handleOpenFolder = useCallback(async () => {
    if (!window.electronAPI) return;

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
  }, [setLoading, updateLoadingProgress, setError, setStudy]);

  // Handle opening ZIP (extraction now happens in main process)
  const handleOpenZip = useCallback(async () => {
    if (!window.electronAPI) return;

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
  }, [setLoading, updateLoadingProgress, setError, setStudy]);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set false if leaving the drop zone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // Note: In Electron, we can't directly access dropped file paths from the renderer
    // The user needs to use the file dialogs. Show a helpful message.
    setError('To open files, please use the "Open Folder" or "Open ZIP" buttons above, or use File menu (Cmd/Ctrl+O).');
  }, [setError]);

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

    window.electronAPI.onMenuAction(handleMenuAction);

    return () => {
      window.electronAPI.removeMenuListeners();
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
