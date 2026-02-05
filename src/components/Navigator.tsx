import { useViewerStore, useKeyImageUIDs, useHasReports } from '../lib/store';
import { getBodyRegionLabel, toPlainLanguage, simplifySeriesDescription } from '../lib/terminology';

export default function Navigator() {
  const study = useViewerStore((s) => s.study);
  const currentSeriesId = useViewerStore((s) => s.currentSeriesId);
  const selectSeries = useViewerStore((s) => s.selectSeries);
  const clearStudy = useViewerStore((s) => s.clearStudy);
  const settings = useViewerStore((s) => s.settings);
  const keyImageUIDs = useKeyImageUIDs();
  const hasReports = useHasReports();

  if (!study) return null;

  return (
    <aside className="w-64 bg-panel-bg border-r border-gray-700 flex flex-col overflow-hidden">
      {/* Study Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-white font-medium truncate" title={study.patientName}>
              {study.patientName}
            </h2>
            <p className="text-gray-400 text-sm">{study.studyDate}</p>
            {study.studyDescription && (
              <p className="text-gray-500 text-xs mt-1 truncate" title={study.studyDescription}>
                {study.studyDescription}
              </p>
            )}
          </div>
          <button
            onClick={clearStudy}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title="Close study"
            aria-label="Close study"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Series List */}
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {study.series.map((series) => {
            const isSelected = currentSeriesId === series.seriesInstanceUID;
            // Create a user-friendly display name
            // Use simplifySeriesDescription to expand abbreviations and clean up technical names
            const baseName = settings.expertMode
              ? series.seriesDescription || 'Series'
              : simplifySeriesDescription(series.seriesDescription, settings.expertMode) ||
                getBodyRegionLabel(series.bodyPart) ||
                'Scan';
            // In expert mode, show series number prefix; in simple mode, just show the name
            const displayName = settings.expertMode
              ? `${series.seriesNumber}. ${baseName}`
              : baseName;

            // Check if this series has any key images
            const keyImagesInSeries = series.images.filter((img) =>
              keyImageUIDs.has(img.sopInstanceUID)
            ).length;
            const hasKeyImages = keyImagesInSeries > 0;

            return (
              <button
                key={series.seriesInstanceUID}
                onClick={() => selectSeries(series.seriesInstanceUID)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-accent/20 text-white border border-accent/40'
                    : 'text-gray-300 hover:bg-gray-700/50 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* Series icon */}
                  <div
                    className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-accent/30' : 'bg-gray-700'
                    }`}
                  >
                    <svg
                      className={`w-4 h-4 ${isSelected ? 'text-accent' : 'text-gray-400'}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-sm flex items-center gap-1.5" title={displayName}>
                      {displayName}
                      {hasKeyImages && (
                        <span title={`${keyImagesInSeries} key image${keyImagesInSeries > 1 ? 's' : ''}`}>
                          <svg
                            className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>
                        {series.images.length} {settings.expertMode ? 'images' : 'slices'}
                      </span>
                      {hasKeyImages && (
                        <span className="text-yellow-400/70">
                          {keyImagesInSeries} key
                        </span>
                      )}
                      {settings.expertMode && series.modality && (
                        <span className="text-gray-600">• {series.modality}</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Footer with study info */}
      <div className="p-3 border-t border-gray-700 text-xs text-gray-500">
        <div className="flex justify-between">
          <span>{study.series.length} {toPlainLanguage('series', settings.expertMode)}</span>
          <span>{toPlainLanguage(study.modality, settings.expertMode)}</span>
        </div>
        {hasReports && (
          <div className="mt-1 flex items-center gap-1 text-accent">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{settings.expertMode ? 'Structured Reports available' : 'Report available'}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
