import { useEffect, useRef, useState } from 'react';
import { useViewerStore, useCurrentSeries, useCurrentImage, useIsCurrentImageKey } from '../lib/store';
import { initializeCornerstone, loadImageToViewport, resetViewport, resizeViewport, cleanup } from '../lib/cornerstone';
import AnnotationOverlay from './AnnotationOverlay';

export default function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const loadRequestIdRef = useRef(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  const currentSeries = useCurrentSeries();
  const currentImage = useCurrentImage();
  const currentSliceIndex = useViewerStore((s) => s.currentSliceIndex);
  const settings = useViewerStore((s) => s.settings);
  const isKeyImage = useIsCurrentImageKey();

  // Initialize Cornerstone
  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!containerRef.current) return;

      try {
        await initializeCornerstone(containerRef.current);
        if (mounted) {
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('Failed to initialize Cornerstone:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize viewer');
        }
      }
    }

    init();

    return () => {
      mounted = false;
      cleanup();
    };
  }, []);

  // Load current image with request sequencing to prevent race conditions
  useEffect(() => {
    if (!isInitialized || !currentImage) return;

    // Increment request ID to track this specific load request
    const requestId = ++loadRequestIdRef.current;

    async function load() {
      if (!currentImage) return;

      setIsLoadingImage(true);
      try {
        await loadImageToViewport(currentImage.filePath);
        // Only update state if this is still the latest request
        if (loadRequestIdRef.current === requestId) {
          setError(null);
        }
      } catch (err) {
        console.error('Failed to load image:', err);
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
  }, [isInitialized, currentImage?.filePath]);

  // Handle reset view from menu
  useEffect(() => {
    if (!window.electronAPI || !isInitialized) return;

    const handleMenuAction = (action: string) => {
      if (action === 'reset-view') {
        resetViewport();
      }
    };

    window.electronAPI.onMenuAction(handleMenuAction);

    return () => {
      window.electronAPI.removeMenuListeners();
    };
  }, [isInitialized]);

  // Handle viewport resize to maintain aspect ratio
  useEffect(() => {
    if (!containerRef.current || !isInitialized) return;

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize calls to avoid excessive re-renders
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        resizeViewport();
      }, 100);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeObserver.disconnect();
    };
  }, [isInitialized]);

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

  return (
    <div className="w-full h-full relative bg-black">
      {/* Cornerstone viewport container */}
      <div
        ref={containerRef}
        className="cornerstone-viewport w-full h-full"
        style={{ touchAction: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Annotation and overlay layer */}
      <AnnotationOverlay />

      {/* Loading indicator */}
      {isLoadingImage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      )}

      {/* Image info overlay */}
      {currentSeries && (
        <div className="absolute top-3 left-3 text-white text-xs bg-black/60 rounded px-2 py-1 flex items-center gap-2">
          <span className="font-medium">
            {settings.expertMode
              ? `${currentSeries.seriesDescription || 'Series'}`
              : `${currentSeries.images.length} slices`}
          </span>
          <span className="text-gray-400">
            {currentSliceIndex + 1} / {currentSeries.images.length}
          </span>
          {isKeyImage && (
            <span className="flex items-center gap-1 text-yellow-400" title="Key Image">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Key
            </span>
          )}
        </div>
      )}

      {/* Controls hint (for first-time users) */}
      {settings.showTooltips && (
        <div className="absolute bottom-3 left-3 text-white/60 text-xs bg-black/40 rounded px-2 py-1">
          <span>Scroll to browse</span>
          <span className="mx-2">·</span>
          <span>Drag to adjust brightness</span>
          <span className="mx-2">·</span>
          <span>Ctrl+scroll to zoom</span>
        </div>
      )}
    </div>
  );
}
