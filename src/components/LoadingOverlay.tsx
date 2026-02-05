import { useViewerStore } from '../lib/store';

// Progress phase descriptions for non-expert users
const PHASE_DESCRIPTIONS: Record<string, string> = {
  scanning: 'Finding your medical images...',
  extracting: 'Unpacking your files...',
  parsing: 'Reading image information...',
  loading: 'Preparing your images...',
};

export default function LoadingOverlay() {
  const progress = useViewerStore((s) => s.loadingProgress);

  const phaseDescription = progress?.phase
    ? PHASE_DESCRIPTIONS[progress.phase] || 'Loading...'
    : 'Loading...';

  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-panel-bg rounded-xl shadow-2xl p-8 max-w-sm w-full mx-4">
        {/* Spinner */}
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>

        {/* Phase description */}
        <p className="text-white text-center text-lg mb-4">{phaseDescription}</p>

        {/* Progress bar */}
        {progress && progress.total > 0 && (
          <div className="space-y-2">
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-gray-400 text-sm text-center">
              {progress.current} of {progress.total} files
            </p>
          </div>
        )}

        {/* Current file (if available) */}
        {progress?.currentFile && (
          <p className="text-gray-500 text-xs text-center mt-3 truncate">
            {progress.currentFile}
          </p>
        )}
      </div>
    </div>
  );
}
