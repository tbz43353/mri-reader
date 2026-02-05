import { useEffect, useCallback } from 'react';
import { useViewerStore } from '../lib/store';
import Navigator from './Navigator';
import Viewport from './Viewport';
import Controls from './Controls';
import MetadataPanel from './MetadataPanel';
import ReportPanel from './ReportPanel';

export default function Viewer() {
  const study = useViewerStore((s) => s.study);
  const nextSlice = useViewerStore((s) => s.nextSlice);
  const prevSlice = useViewerStore((s) => s.prevSlice);
  const goToFirstSlice = useViewerStore((s) => s.goToFirstSlice);
  const goToLastSlice = useViewerStore((s) => s.goToLastSlice);
  const clearStudy = useViewerStore((s) => s.clearStudy);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        prevSlice();
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        nextSlice();
        break;
      case 'Home':
        e.preventDefault();
        goToFirstSlice();
        break;
      case 'End':
        e.preventDefault();
        goToLastSlice();
        break;
      case 'Escape':
        clearStudy();
        break;
    }
  }, [nextSlice, prevSlice, goToFirstSlice, goToLastSlice, clearStudy]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle wheel scroll for slice navigation
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (e.deltaY > 0) {
      nextSlice();
    } else {
      prevSlice();
    }
  }, [nextSlice, prevSlice]);

  if (!study) {
    return null;
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sidebar - Navigator */}
      <Navigator />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Viewport */}
        <div className="flex-1 relative overflow-hidden" onWheel={handleWheel as unknown as React.WheelEventHandler}>
          <Viewport />
        </div>

        {/* Report panel (if reports exist) */}
        <ReportPanel />

        {/* Bottom controls */}
        <Controls />
      </div>

      {/* Right sidebar - Metadata (optional) */}
      <MetadataPanel />
    </div>
  );
}
