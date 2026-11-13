import { useEffect, useCallback, useRef } from 'react';
import { useViewerStore } from '../lib/store';
import { resetViewport } from '../lib/cornerstone';
import Navigator from './Navigator';
import Viewport from './Viewport';
import Controls from './Controls';
import MetadataPanel from './MetadataPanel';
import ReportPanel from './ReportPanel';
import WorkstationToolbar from './WorkstationToolbar';

export default function Viewer() {
  const study = useViewerStore((s) => s.study);
  const layout = useViewerStore((s) => s.layout);
  const activeViewportIndex = useViewerStore((s) => s.activeViewportIndex);
  const setActiveViewport = useViewerStore((s) => s.setActiveViewport);
  const setViewportSliceIndex = useViewerStore((s) => s.setViewportSliceIndex);

  const nextSlice = useViewerStore((s) => s.nextSlice);
  const prevSlice = useViewerStore((s) => s.prevSlice);
  const goToFirstSlice = useViewerStore((s) => s.goToFirstSlice);
  const goToLastSlice = useViewerStore((s) => s.goToLastSlice);
  const clearStudy = useViewerStore((s) => s.clearStudy);
  const resetAdjustments = useViewerStore((s) => s.resetAdjustments);

  const cine = useViewerStore((s) => s.cine);
  const toggleCine = useViewerStore((s) => s.toggleCine);
  const toggleCornerOverlays = useViewerStore((s) => s.toggleCornerOverlays);
  const setActiveTool = useViewerStore((s) => s.setActiveTool);

  const cineDirectionRef = useRef<number>(1);

  // Cine Auto-Play Loop
  useEffect(() => {
    if (!cine.isPlaying || !study) return;

    const intervalMs = Math.round(1000 / cine.fps);
    const interval = setInterval(() => {
      const { viewports, activeViewportIndex, study } = useViewerStore.getState();
      const slot = viewports[activeViewportIndex];
      if (!slot) return;
      const series = study?.series.find((s) => s.seriesInstanceUID === slot.seriesInstanceUID);
      if (!series || series.images.length <= 1) return;

      const total = series.images.length;
      let nextIndex = slot.sliceIndex;

      if (cine.mode === 'loop') {
        nextIndex = (slot.sliceIndex + 1) % total;
      } else {
        // Ping-pong mode
        if (slot.sliceIndex >= total - 1) {
          cineDirectionRef.current = -1;
        } else if (slot.sliceIndex <= 0) {
          cineDirectionRef.current = 1;
        }
        nextIndex = slot.sliceIndex + cineDirectionRef.current;
        if (nextIndex < 0) nextIndex = 0;
        if (nextIndex >= total) nextIndex = total - 1;
      }

      setViewportSliceIndex(activeViewportIndex, nextIndex);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [cine.isPlaying, cine.fps, cine.mode, setViewportSliceIndex, study]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const visibleCount = layout === '1x1' ? 1 : layout === '1x2' ? 2 : 4;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          toggleCine();
          break;
        case 'o':
        case 'O':
          e.preventDefault();
          toggleCornerOverlays();
          break;
        case 'p':
        case 'P':
          setActiveTool('pan');
          break;
        case 'd':
        case 'D':
          setActiveTool('length');
          break;
        case 'a':
        case 'A':
          setActiveTool('angle');
          break;
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
        case 'Tab':
          e.preventDefault();
          setActiveViewport((activeViewportIndex + 1) % visibleCount);
          break;
        case 'r':
        case 'R':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            resetAdjustments();
            resetViewport();
          }
          break;
        case 'Escape':
          clearStudy();
          break;
      }
    },
    [
      nextSlice,
      prevSlice,
      goToFirstSlice,
      goToLastSlice,
      clearStudy,
      layout,
      activeViewportIndex,
      setActiveViewport,
      toggleCine,
      toggleCornerOverlays,
      setActiveTool,
      resetAdjustments,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!study) {
    return null;
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sidebar - Navigator */}
      <Navigator />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Workstation Diagnostic Toolbar */}
        <WorkstationToolbar />

        {/* Viewport Area (1x1, 1x2, or 2x2 Grid) */}
        <div className="flex-1 relative overflow-hidden bg-black">
          {layout === '1x1' && (
            <div className="w-full h-full relative overflow-hidden">
              <Viewport viewportIndex={0} />
            </div>
          )}

          {layout === '1x2' && (
            <div className="w-full h-full grid grid-cols-2 gap-1.5 p-1 bg-gray-950 overflow-hidden">
              <div className="relative h-full w-full overflow-hidden rounded bg-black">
                <Viewport viewportIndex={0} />
              </div>
              <div className="relative h-full w-full overflow-hidden rounded bg-black">
                <Viewport viewportIndex={1} />
              </div>
            </div>
          )}

          {layout === '2x2' && (
            <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-1.5 p-1 bg-gray-950 overflow-hidden">
              <div className="relative h-full w-full overflow-hidden rounded bg-black">
                <Viewport viewportIndex={0} />
              </div>
              <div className="relative h-full w-full overflow-hidden rounded bg-black">
                <Viewport viewportIndex={1} />
              </div>
              <div className="relative h-full w-full overflow-hidden rounded bg-black">
                <Viewport viewportIndex={2} />
              </div>
              <div className="relative h-full w-full overflow-hidden rounded bg-black">
                <Viewport viewportIndex={3} />
              </div>
            </div>
          )}
        </div>

        {/* Report panel (if reports exist) */}
        <ReportPanel />

        {/* Bottom controls */}
        <Controls />
      </div>

      {/* Right sidebar - Metadata & Adjustments */}
      <MetadataPanel />
    </div>
  );
}
