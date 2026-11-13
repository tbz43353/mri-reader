import { useEffect, useRef, useState } from 'react';
import {
  useViewerStore,
  useCurrentSeries,
  useCurrentImage,
  useIsCurrentImageKey,
} from '../lib/store';
import {
  enableViewport,
  disableViewport,
  loadImageToViewport,
  resetViewport,
  resizeViewport,
} from '../lib/cornerstone';
import AnnotationOverlay from './AnnotationOverlay';
import LocalizerOverlay from './LocalizerOverlay';
import MeasurementOverlay from './MeasurementOverlay';
import CornerOverlays from './CornerOverlays';
import { simplifySeriesDescription } from '../lib/terminology';
import type { SeriesInstanceUID } from '../types';

interface ViewportProps {
  viewportIndex?: number;
}

export default function Viewport({ viewportIndex = 0 }: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const loadRequestIdRef = useRef(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [showSeriesMenu, setShowSeriesMenu] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const viewportId = `mriReaderViewport-${viewportIndex}`;

  const layout = useViewerStore((s) => s.layout);
  const study = useViewerStore((s) => s.study);
  const activeViewportIndex = useViewerStore((s) => s.activeViewportIndex);
  const setActiveViewport = useViewerStore((s) => s.setActiveViewport);
  const setViewportSeries = useViewerStore((s) => s.setViewportSeries);
  const setViewportSliceIndex = useViewerStore((s) => s.setViewportSliceIndex);
  const slot = useViewerStore((s) => s.viewports[viewportIndex]);

  const currentSeries = useCurrentSeries(viewportIndex);
  const currentImage = useCurrentImage(viewportIndex);
  const currentSliceIndex = slot?.sliceIndex ?? 0;
  const settings = useViewerStore((s) => s.settings);
  const isKeyImage = useIsCurrentImageKey(viewportIndex);
  const gamma = useViewerStore((s) => s.adjustments.gamma);

  const isActive = layout === '1x1' || activeViewportIndex === viewportIndex;

  // Initialize Cornerstone viewport on this container
  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!containerRef.current) return;

      try {
        await enableViewport(viewportId, containerRef.current);
        if (mounted) {
          setIsInitialized(true);
        }
      } catch (err) {
        console.error(`Failed to enable viewport ${viewportId}:`, err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize viewer');
        }
      }
    }

    init();

    return () => {
      mounted = false;
      disableViewport(viewportId);
    };
  }, [viewportId]);

  // Load current image with request sequencing to prevent race conditions
  useEffect(() => {
    if (!isInitialized || !currentImage) return;

    const requestId = ++loadRequestIdRef.current;

    async function load() {
      if (!currentImage) return;

      setIsLoadingImage(true);
      try {
        await loadImageToViewport(
          currentImage.filePath,
          currentSeries?.seriesInstanceUID,
          viewportId
        );
        if (loadRequestIdRef.current === requestId) {
          setError(null);
        }
      } catch (err) {
        console.error(`Failed to load image to ${viewportId}:`, err);
        if (loadRequestIdRef.current === requestId) {
          setError(err instanceof Error ? err.message : 'Failed to load image');
        }
      } finally {
        if (loadRequestIdRef.current === requestId) {
          setIsLoadingImage(false);
        }
      }
    }

    load();
  }, [isInitialized, currentImage?.filePath, currentSeries?.seriesInstanceUID, viewportId]);

  // Handle reset view from menu
  useEffect(() => {
    if (!window.electronAPI || !isInitialized) return;

    const handleMenuAction = (action: string) => {
      if (action === 'reset-view') {
        resetViewport(viewportId);
      }
    };

    const unsubscribe = window.electronAPI.onMenuAction(handleMenuAction);

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isInitialized, viewportId]);

  // Handle viewport resize to maintain aspect ratio
  useEffect(() => {
    if (!containerRef.current || !isInitialized) return;

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        resizeViewport();
      }, 80);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeObserver.disconnect();
    };
  }, [isInitialized]);

  const handleViewportClick = () => {
    if (activeViewportIndex !== viewportIndex) {
      setActiveViewport(viewportIndex);
    }
  };

  const handleWheelSliceScroll = (e: React.WheelEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      if (e.deltaY > 0) {
        setViewportSliceIndex(viewportIndex, currentSliceIndex + 1);
      } else if (e.deltaY < 0) {
        setViewportSliceIndex(viewportIndex, currentSliceIndex - 1);
      }
    }
  };

  // Drag-and-drop series into viewport slot
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const seriesUID = e.dataTransfer.getData('text/series-id');
    if (seriesUID) {
      setViewportSeries(viewportIndex, seriesUID as SeriesInstanceUID);
      setActiveViewport(viewportIndex);
    }
  };

  if (error && !isInitialized) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center p-8">
          <p className="text-red-400 mb-4">{error}</p>
          <p className="text-gray-500 text-sm">
            The image viewer could not be initialized.
            <br />
            Try restarting the application.
          </p>
        </div>
      </div>
    );
  }

  const slotLabels = ['Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right'];
  const slotTag = layout === '1x2' ? (viewportIndex === 0 ? 'Left' : 'Right') : `V${viewportIndex + 1}`;

  return (
    <div
      onClick={handleViewportClick}
      onWheel={handleWheelSliceScroll}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`w-full h-full relative bg-black flex flex-col overflow-hidden transition-all duration-150 ${
        layout !== '1x1'
          ? isActive
            ? 'ring-2 ring-accent border border-accent/80 shadow-lg'
            : isDragOver
            ? 'ring-2 ring-cyan-400 bg-sky-950/20'
            : 'ring-1 ring-gray-800 opacity-95 hover:opacity-100'
          : ''
      }`}
    >
      {/* SVG Gamma correction filter */}
      <svg className="absolute w-0 h-0 overflow-hidden" aria-hidden="true">
        <defs>
          <filter id={`mri-gamma-filter-${viewportIndex}`} colorInterpolationFilters="sRGB">
            <feComponentTransfer>
              <feFuncR type="gamma" exponent={1 / Math.max(0.1, gamma)} />
              <feFuncG type="gamma" exponent={1 / Math.max(0.1, gamma)} />
              <feFuncB type="gamma" exponent={1 / Math.max(0.1, gamma)} />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      {/* Cornerstone viewport canvas container */}
      <div
        ref={containerRef}
        className="cornerstone-viewport w-full h-full flex-1"
        style={{
          touchAction: 'none',
          filter: Math.abs(gamma - 1.0) > 0.01 ? `url(#mri-gamma-filter-${viewportIndex})` : undefined,
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Annotation and overlay layer */}
      <AnnotationOverlay viewportIndex={viewportIndex} viewportId={viewportId} />

      {/* Interactive Calibrated Measurements & ROI Layer */}
      <MeasurementOverlay viewportIndex={viewportIndex} viewportId={viewportId} />

      {/* Cross-referencing scout lines layer */}
      <LocalizerOverlay viewportIndex={viewportIndex} viewportId={viewportId} />

      {/* 4-Corner DICOM Canvas Overlays & Direction Markers */}
      <CornerOverlays viewportIndex={viewportIndex} viewportId={viewportId} />

      {/* Loading indicator */}
      {isLoadingImage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none z-20">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      )}

      {/* Drag & Drop Visual Hint */}
      {isDragOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-sky-900/40 border-2 border-dashed border-cyan-400 z-30 pointer-events-none">
          <div className="text-white font-semibold text-sm bg-black/80 px-4 py-2 rounded-lg shadow-xl">
            Drop Series Here
          </div>
        </div>
      )}

      {/* Image load error overlay */}
      {error && isInitialized && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 z-20 p-6">
          <div className="text-center p-6 max-w-md bg-gray-900 border border-red-500/40 rounded-xl shadow-2xl">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-900/40 border border-red-500/30 flex items-center justify-center text-red-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-white font-semibold text-base mb-1">Image Load Error</h3>
            <p className="text-red-300 text-xs mb-4 font-mono bg-red-950/40 p-2 rounded border border-red-900/40 break-words text-left">
              {error}
            </p>
            <button
              onClick={() => {
                setError(null);
                if (currentImage) {
                  loadImageToViewport(currentImage.filePath, currentSeries?.seriesInstanceUID, viewportId);
                }
              }}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded transition-colors"
            >
              Retry Loading Image
            </button>
          </div>
        </div>
      )}

      {/* Viewport Top Header & Series Switcher */}
      {currentSeries && (
        <div className="absolute top-2 left-2 z-25 flex items-center gap-1.5 pointer-events-auto">
          {/* Active Viewport Tag */}
          {layout !== '1x1' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveViewport(viewportIndex);
              }}
              className={`px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded transition-colors ${
                isActive
                  ? 'bg-accent text-white shadow-sm shadow-accent/50'
                  : 'bg-gray-800/80 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
              title={isActive ? 'Active Viewport' : `Click to focus ${slotLabels[viewportIndex] || slotTag}`}
            >
              {slotTag} {isActive ? '• Active' : ''}
            </button>
          )}

          {/* Series Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSeriesMenu((prev) => !prev);
              }}
              className="text-white text-[11px] bg-black/80 hover:bg-black/95 border border-gray-700/70 rounded px-2 py-0.5 flex items-center gap-1.5 backdrop-blur-sm transition-colors"
              title="Click or drag series to change"
            >
              <span className="font-medium max-w-[120px] sm:max-w-[160px] truncate">
                {settings.expertMode
                  ? currentSeries.seriesDescription || 'Series'
                  : simplifySeriesDescription(currentSeries.seriesDescription, settings.expertMode) || 'Scan'}
              </span>
              <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showSeriesMenu && study && (
              <div
                className="absolute left-0 top-full mt-1 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 z-35 max-h-72 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800">
                  Select Series for {slotTag} Viewport
                </div>
                {study.series.map((s) => (
                  <button
                    key={s.seriesInstanceUID}
                    onClick={() => {
                      setViewportSeries(viewportIndex, s.seriesInstanceUID as SeriesInstanceUID);
                      setShowSeriesMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-gray-800 transition-colors ${
                      s.seriesInstanceUID === currentSeries.seriesInstanceUID
                        ? 'text-accent font-medium bg-accent/10'
                        : 'text-gray-300'
                    }`}
                  >
                    <span className="truncate flex-1 pr-2">
                      {settings.expertMode
                        ? `${s.seriesNumber}. ${s.seriesDescription || 'Series'}`
                        : simplifySeriesDescription(s.seriesDescription, settings.expertMode)}
                    </span>
                    <span className="text-[10px] text-gray-500">{s.images.length} sl.</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Slice Counter */}
          <div className="text-white text-[11px] bg-black/80 border border-gray-700/70 rounded px-2 py-0.5 flex items-center gap-1.5 backdrop-blur-sm">
            <span className="text-gray-300 font-mono font-medium">
              {currentSliceIndex + 1} / {currentSeries.images.length}
            </span>
            {isKeyImage && (
              <span className="text-yellow-400 text-[10px] font-bold" title="Key Image">
                ★ Key
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
