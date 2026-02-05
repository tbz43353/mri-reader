import { useViewerStore, useCurrentSeries, useSliceCount } from '../lib/store';
import { resetViewport } from '../lib/cornerstone';
import { getPresetsForModality } from '../lib/terminology';

export default function Controls() {
  const currentSliceIndex = useViewerStore((s) => s.currentSliceIndex);
  const setSliceIndex = useViewerStore((s) => s.setSliceIndex);
  const nextSlice = useViewerStore((s) => s.nextSlice);
  const prevSlice = useViewerStore((s) => s.prevSlice);
  const goToFirstSlice = useViewerStore((s) => s.goToFirstSlice);
  const goToLastSlice = useViewerStore((s) => s.goToLastSlice);
  const settings = useViewerStore((s) => s.settings);

  const currentSeries = useCurrentSeries();
  const sliceCount = useSliceCount();

  if (!currentSeries || sliceCount === 0) return null;

  const presets = getPresetsForModality(currentSeries.modality);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSliceIndex(parseInt(e.target.value, 10));
  };

  const handleReset = () => {
    resetViewport();
  };

  return (
    <div className="bg-panel-bg border-t border-gray-700 px-4 py-3">
      <div className="flex items-center gap-4">
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

        {/* Slice slider */}
        <div className="flex-1 flex items-center gap-3">
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
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                title={preset.description}
              >
                {preset.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Keyboard hint for first-time users */}
      {settings.showTooltips && (
        <div className="mt-2 text-xs text-gray-600 text-center">
          Use arrow keys to browse • R to reset view • Ctrl+scroll to zoom
        </div>
      )}
    </div>
  );
}
