import { useState } from 'react';
import { useViewerStore, useSliceCount } from '../lib/store';
import { captureViewportCanvas } from '../lib/cornerstone';
import type { ActiveTool } from '../types';

export default function WorkstationToolbar() {
  const layout = useViewerStore((s) => s.layout);
  const setLayout = useViewerStore((s) => s.setLayout);
  const activeViewportIndex = useViewerStore((s) => s.activeViewportIndex);
  const activeTool = useViewerStore((s) => s.activeTool);
  const setActiveTool = useViewerStore((s) => s.setActiveTool);

  const cine = useViewerStore((s) => s.cine);
  const toggleCine = useViewerStore((s) => s.toggleCine);
  const setCineFps = useViewerStore((s) => s.setCineFps);
  const toggleCineMode = useViewerStore((s) => s.toggleCineMode);

  const showCornerOverlays = useViewerStore((s) => s.showCornerOverlays);
  const toggleCornerOverlays = useViewerStore((s) => s.toggleCornerOverlays);
  const showOrientationMarkers = useViewerStore((s) => s.showOrientationMarkers);
  const toggleOrientationMarkers = useViewerStore((s) => s.toggleOrientationMarkers);
  const isLinkedScrolling = useViewerStore((s) => s.isLinkedScrolling);
  const toggleLinkedScrolling = useViewerStore((s) => s.toggleLinkedScrolling);

  const clearMeasurements = useViewerStore((s) => s.clearMeasurements);
  const measurements = useViewerStore((s) => s.measurements);
  const sliceCount = useSliceCount();

  const [fpsMenuOpen, setFpsMenuOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleExport = () => {
    const viewportId = `mriReaderViewport-${activeViewportIndex}`;
    const canvas = captureViewportCanvas(viewportId);
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `mri-export-${Date.now()}.png`;
      a.click();

      setExportNotice('Image exported!');
      setTimeout(() => setExportNotice(null), 2500);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const tools: { id: ActiveTool; label: string; icon: React.ReactNode; tooltip: string }[] = [
    {
      id: 'pan',
      label: 'Pan',
      tooltip: 'Pan & Zoom (P)',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
        </svg>
      ),
    },
    {
      id: 'length',
      label: 'Ruler',
      tooltip: 'Calibrated Distance in mm (D)',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20l16-16m-4 0h4v4M8 20H4v-4m3-1l2 2m3-7l2 2m3-7l2 2" />
        </svg>
      ),
    },
    {
      id: 'angle',
      label: 'Angle',
      tooltip: 'Angle & Cobb Angle (A)',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 20h16M4 20l14-14m-7 14a7 7 0 00-7-7" />
        </svg>
      ),
    },
    {
      id: 'rectangle',
      label: 'Rect ROI',
      tooltip: 'Rectangle ROI with Mean/Min/Max (R)',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <rect x="4" y="5" width="16" height="14" rx="1.5" strokeWidth={2} strokeDasharray="3 2" />
        </svg>
      ),
    },
    {
      id: 'ellipse',
      label: 'Ellipse ROI',
      tooltip: 'Elliptical ROI with Area & Signal Stats',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <ellipse cx="12" cy="12" rx="8" ry="6" strokeWidth={2} strokeDasharray="3 2" />
        </svg>
      ),
    },
    {
      id: 'probe',
      label: 'Probe',
      tooltip: 'Live Pixel Signal Intensity under Cursor',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v4m0 8v4m-8-8h4m8 0h4m-7 0a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="bg-panel-bg border-b border-gray-800 px-3 py-1.5 flex items-center justify-between text-xs gap-2 select-none overflow-x-auto">
      {/* Left: Interactive Diagnostic Tools */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase font-semibold text-gray-500 mr-1 tracking-wider hidden sm:inline">
          Tools:
        </span>
        {tools.map((t) => {
          const isActive = activeTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              className={`px-2 py-1 rounded flex items-center gap-1.5 transition-colors ${
                isActive
                  ? 'bg-accent text-white font-medium shadow-sm shadow-accent/40'
                  : 'text-gray-300 hover:text-white hover:bg-gray-800'
              }`}
              title={t.tooltip}
            >
              {t.icon}
              <span className="hidden md:inline">{t.label}</span>
            </button>
          );
        })}

        {measurements.length > 0 && (
          <button
            onClick={clearMeasurements}
            className="px-1.5 py-1 text-gray-500 hover:text-red-400 hover:bg-red-950/30 rounded transition-colors text-[11px]"
            title="Clear all measurements"
          >
            Clear ({measurements.length})
          </button>
        )}
      </div>

      {/* Middle: Cine Movie Mode & Link Scrolling */}
      <div className="flex items-center gap-1.5 border-x border-gray-800 px-3">
        {/* Cine Play/Pause */}
        <button
          onClick={toggleCine}
          disabled={sliceCount <= 1}
          className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-medium transition-colors ${
            cine.isPlaying
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/40 animate-pulse'
              : 'text-gray-300 hover:text-white hover:bg-gray-800'
          }`}
          title="Play/Pause Cine Loop (Spacebar)"
        >
          {cine.isPlaying ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
          )}
          <span>{cine.isPlaying ? 'Pause' : 'Cine'}</span>
        </button>

        {/* FPS selector */}
        <div className="relative">
          <button
            onClick={() => setFpsMenuOpen(!fpsMenuOpen)}
            className="px-2 py-1 text-[11px] font-mono text-gray-400 hover:text-white hover:bg-gray-800 rounded border border-gray-700/60"
            title="Adjust Cine Frame Rate"
          >
            {cine.fps} FPS ▾
          </button>
          {fpsMenuOpen && (
            <div className="absolute left-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-md shadow-xl py-1 z-30 min-w-[70px]">
              {[5, 10, 15, 24, 30].map((fps) => (
                <button
                  key={fps}
                  onClick={() => {
                    setCineFps(fps);
                    setFpsMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1 font-mono text-xs hover:bg-gray-800 ${
                    cine.fps === fps ? 'text-accent font-bold' : 'text-gray-300'
                  }`}
                >
                  {fps} FPS
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cine Mode (Loop / Ping-Pong) */}
        <button
          onClick={toggleCineMode}
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          title={`Cine mode: ${cine.mode === 'loop' ? 'Loop (click for Ping-Pong)' : 'Ping-Pong (click for Loop)'}`}
        >
          {cine.mode === 'loop' ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          )}
        </button>

        {/* Synchronized Slice Scrolling */}
        <button
          onClick={toggleLinkedScrolling}
          className={`px-2 py-1 rounded flex items-center gap-1.5 transition-colors ${
            isLinkedScrolling
              ? 'bg-sky-500/30 text-sky-200 border border-sky-400/50'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
          title="Synchronize slice scrolling across visible viewports"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span className="hidden xl:inline">Sync Scroll</span>
        </button>
      </div>

      {/* Right: Display Toggles, Grid Layout & Export */}
      <div className="flex items-center gap-1">
        {/* Toggle Overlays (O) */}
        <button
          onClick={toggleCornerOverlays}
          className={`p-1.5 rounded transition-colors ${
            showCornerOverlays ? 'text-accent hover:bg-gray-800' : 'text-gray-500 hover:text-white hover:bg-gray-800'
          }`}
          title="Toggle DICOM 4-Corner Overlays (O key)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>

        {/* Toggle Orientation Markers */}
        <button
          onClick={toggleOrientationMarkers}
          className={`px-1.5 py-1 text-[11px] font-bold rounded transition-colors ${
            showOrientationMarkers ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-500/30' : 'text-gray-500 hover:text-white'
          }`}
          title="Toggle Anatomical Direction Markers (A/P/L/R)"
        >
          A/P
        </button>

        {/* Layout Grid Buttons */}
        <div className="flex items-center gap-0.5 border-l border-gray-800 pl-2 ml-1">
          <button
            onClick={() => setLayout('1x1')}
            className={`p-1.5 rounded transition-colors ${
              layout === '1x1' ? 'bg-accent/30 text-white border border-accent/40' : 'text-gray-400 hover:text-white'
            }`}
            title="Single (1x1)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
            </svg>
          </button>
          <button
            onClick={() => setLayout('1x2')}
            className={`p-1.5 rounded transition-colors ${
              layout === '1x2' ? 'bg-accent/30 text-white border border-accent/40' : 'text-gray-400 hover:text-white'
            }`}
            title="Dual Split (1x2)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
              <line x1="12" y1="3" x2="12" y2="21" strokeWidth={2} />
            </svg>
          </button>
          <button
            onClick={() => setLayout('2x2')}
            className={`p-1.5 rounded transition-colors ${
              layout === '2x2' ? 'bg-accent/30 text-white border border-accent/40' : 'text-gray-400 hover:text-white'
            }`}
            title="Quad Grid (2x2)"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
              <line x1="12" y1="3" x2="12" y2="21" strokeWidth={2} />
              <line x1="3" y1="12" x2="21" y2="12" strokeWidth={2} />
            </svg>
          </button>
        </div>

        {/* Screenshot / Export button */}
        <button
          onClick={handleExport}
          className="ml-2 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 hover:text-white rounded flex items-center gap-1.5 transition-colors border border-gray-700"
          title="Export Active Viewport Screenshot"
        >
          <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span className="hidden sm:inline">Export</span>
        </button>

        {exportNotice && (
          <span className="text-[10px] text-emerald-400 font-semibold animate-pulse">
            {exportNotice}
          </span>
        )}
      </div>
    </div>
  );
}
