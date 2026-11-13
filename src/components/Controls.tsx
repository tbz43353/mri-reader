import { useViewerStore, useCurrentSeries, useSliceCount } from '../lib/store';
import { resetViewport, applyAdjustments } from '../lib/cornerstone';
import { getPresetsForModality } from '../lib/terminology';
import type { ViewingPreset } from '../types';

export default function Controls() {
  const adjustments = useViewerStore((s) => s.adjustments);
  const activePresetId = adjustments.activePreset;
  const applyPreset = useViewerStore((s) => s.applyPreset);
  const resetAdjustments = useViewerStore((s) => s.resetAdjustments);
  const currentSliceIndex = useViewerStore((s) => s.currentSliceIndex);
  const setSliceIndex = useViewerStore((s) => s.setSliceIndex);
  const nextSlice = useViewerStore((s) => s.nextSlice);
  const prevSlice = useViewerStore((s) => s.prevSlice);
  const goToFirstSlice = useViewerStore((s) => s.goToFirstSlice);
  const goToLastSlice = useViewerStore((s) => s.goToLastSlice);
  const settings = useViewerStore((s) => s.settings);

  const layout = useViewerStore((s) => s.layout);
  const setLayout = useViewerStore((s) => s.setLayout);
  const activeViewportIndex = useViewerStore((s) => s.activeViewportIndex);
  const setActiveViewport = useViewerStore((s) => s.setActiveViewport);

  const currentSeries = useCurrentSeries();
  const sliceCount = useSliceCount();

  if (!currentSeries || sliceCount === 0) return null;

  const presets = getPresetsForModality(currentSeries.modality);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSliceIndex(parseInt(e.target.value, 10));
  };

  const handleReset = () => {
    resetAdjustments();
    resetViewport();
  };

  const handlePresetClick = (preset: ViewingPreset) => {
    applyPreset(preset.id);
    applyAdjustments(0, 0, adjustments.invert, preset.id);
  };

  return (
    <div className="bg-panel-bg border-t border-gray-700 px-4 py-3">
      <div className="flex items-center gap-4">
        {/* Layout Switcher (1x1 Single, 1x2 Split & 2x2 Quad) */}
        <div className="flex items-center gap-1 border-r border-gray-700 pr-3">
          <button
            onClick={() => setLayout('1x1')}
            className={`p-1.5 rounded transition-colors ${
              layout === '1x1'
                ? 'bg-accent/30 text-white border border-accent/50 shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-gray-700 border border-transparent'
            }`}
            title="Single Viewport (1x1)"
            aria-label="Single viewport layout"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
            </svg>
          </button>
          <button
            onClick={() => setLayout('1x2')}
            className={`p-1.5 rounded transition-colors ${
              layout === '1x2'
                ? 'bg-accent/30 text-white border border-accent/50 shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-gray-700 border border-transparent'
            }`}
            title="Split Screen Dual Viewports (1x2)"
            aria-label="Dual split-screen layout"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
              <line x1="12" y1="3" x2="12" y2="21" strokeWidth={2} />
            </svg>
          </button>
          <button
            onClick={() => setLayout('2x2')}
            className={`p-1.5 rounded transition-colors ${
              layout === '2x2'
                ? 'bg-accent/30 text-white border border-accent/50 shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-gray-700 border border-transparent'
            }`}
            title="Quad Grid Viewports (2x2)"
            aria-label="Quad grid layout"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
              <line x1="12" y1="3" x2="12" y2="21" strokeWidth={2} />
              <line x1="3" y1="12" x2="21" y2="12" strokeWidth={2} />
            </svg>
          </button>
        </div>

        {/* Multi-viewport active focus button */}
        {layout !== '1x1' && (
          <button
            onClick={() => {
              const count = layout === '1x2' ? 2 : 4;
              setActiveViewport((activeViewportIndex + 1) % count);
            }}
            className="px-2.5 py-1 text-xs font-semibold rounded bg-gray-800 hover:bg-gray-700 border border-gray-600 text-cyan-300 flex items-center gap-1.5 transition-colors"
            title="Cycle focus between viewports (Tab key)"
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>
              Focus:{' '}
              {layout === '1x2'
                ? activeViewportIndex === 0
                  ? 'Left'
                  : 'Right'
                : `V${activeViewportIndex + 1}`}
            </span>
            <span className="text-[10px] text-gray-400">(Tab)</span>
          </button>
        )}

        {/* Slice navigation buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={goToFirstSlice}
            disabled={currentSliceIndex === 0}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={settings.expertMode ? 'First slice (Home)' : 'Go to start (Home key)'}
            aria-label="Go to first slice"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={prevSlice}
            disabled={currentSliceIndex === 0}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={settings.expertMode ? 'Previous slice (↑)' : 'Previous (↑ key)'}
            aria-label="Previous slice"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={nextSlice}
            disabled={currentSliceIndex === sliceCount - 1}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={settings.expertMode ? 'Next slice (↓)' : 'Next (↓ key)'}
            aria-label="Next slice"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={goToLastSlice}
            disabled={currentSliceIndex === sliceCount - 1}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={settings.expertMode ? 'Last slice (End)' : 'Go to end (End key)'}
            aria-label="Go to last slice"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Slice slider (scroll over slider or use arrows to change slice) */}
        <div
          className="flex-1 flex items-center gap-3"
          onWheel={(e) => {
            if (e.deltaY > 0) nextSlice();
            else if (e.deltaY < 0) prevSlice();
          }}
          title="Scroll or drag to change slice"
        >
          <input
            type="range"
            min={0}
            max={sliceCount - 1}
            value={currentSliceIndex}
            onChange={handleSliderChange}
            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent"
            aria-label="Slice slider"
          />
          <span className="text-gray-400 text-sm min-w-[80px] text-center">
            {settings.expertMode ? (
              `${currentSliceIndex + 1} / ${sliceCount}`
            ) : (
              <span>
                <span className="text-white">{currentSliceIndex + 1}</span>
                <span className="text-gray-500"> of {sliceCount}</span>
              </span>
            )}
          </span>
        </div>

        {/* Reset button */}
        <button
          onClick={handleReset}
          className="px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors flex items-center gap-2"
          title="Reset view (R)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span className="text-sm hidden sm:inline">Reset</span>
        </button>

        {/* View presets (non-expert mode only, if there are presets) */}
        {!settings.expertMode && presets.length > 1 && (
          <div className="hidden md:flex items-center gap-1 border-l border-gray-700 pl-4">
            {presets.slice(0, 3).map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetClick(preset)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  activePresetId === preset.id
                    ? 'bg-accent/30 text-white font-medium border border-accent/40'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700 border border-transparent'
                }`}
                title={preset.description}
              >
                {preset.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Keyboard hint for users */}
      {settings.showTooltips && (
        <div className="mt-2 text-xs text-gray-600 text-center">
          {layout === '1x2'
            ? 'Tab to switch active viewport • Arrow keys to browse slices • Shift+Scroll over viewport to navigate • R to reset view'
            : 'Use arrow keys to browse • R to reset view • Two-finger pinch to zoom'}
        </div>
      )}
    </div>
  );
}
