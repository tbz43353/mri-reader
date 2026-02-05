import { useState } from 'react';
import { useViewerStore, useCurrentSeries, useCurrentImage } from '../lib/store';
import { toPlainLanguage, getBodyRegionLabel, simplifySeriesDescription } from '../lib/terminology';

export default function MetadataPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const study = useViewerStore((s) => s.study);
  const settings = useViewerStore((s) => s.settings);
  const updateSettings = useViewerStore((s) => s.updateSettings);

  const currentSeries = useCurrentSeries();
  const currentImage = useCurrentImage();

  if (!study) return null;

  // In non-expert mode with tooltips off, show a floating help button
  if (!settings.expertMode && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 bg-accent text-white p-3 rounded-full shadow-lg hover:bg-accent-hover transition-colors z-10"
        aria-label="Show scan information"
        title="Show scan information"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    );
  }

  // In expert mode, show full panel
  return (
    <aside
      className={`bg-panel-bg border-l border-gray-700 flex flex-col transition-all duration-200 ${
        isOpen || settings.expertMode ? 'w-72' : 'w-0 overflow-hidden'
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-white font-medium">
          {settings.expertMode ? 'Metadata' : 'About This Scan'}
        </h3>
        {!settings.expertMode && (
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Study info */}
        <Section title={settings.expertMode ? 'Study' : 'Patient Information'}>
          <Field label={settings.expertMode ? 'Patient Name' : 'Name'} value={study.patientName} />
          {settings.expertMode && study.patientId && (
            <Field label="Patient ID" value={study.patientId} />
          )}
          <Field label={settings.expertMode ? 'Study Date' : 'Date'} value={study.studyDate} />
          {study.studyDescription && (
            <Field label="Description" value={study.studyDescription} />
          )}
          <Field
            label={settings.expertMode ? 'Modality' : 'Scan Type'}
            value={toPlainLanguage(study.modality, settings.expertMode)}
          />
          {settings.expertMode && study.institutionName && (
            <Field label="Institution" value={study.institutionName} />
          )}
        </Section>

        {/* Series info */}
        {currentSeries && (
          <Section title={settings.expertMode ? 'Series' : 'Current Sequence'}>
            <Field
              label={settings.expertMode ? 'Series Description' : 'Name'}
              value={
                settings.expertMode
                  ? currentSeries.seriesDescription || `Series ${currentSeries.seriesNumber}`
                  : simplifySeriesDescription(currentSeries.seriesDescription, settings.expertMode) ||
                    getBodyRegionLabel(currentSeries.bodyPart) ||
                    'Scan Sequence'
              }
            />
            {settings.expertMode && (
              <Field label="Series Number" value={String(currentSeries.seriesNumber)} />
            )}
            {/* Only show body part if it's specific (not generic like WHOLEBODY) */}
            {currentSeries.bodyPart &&
              !['WHOLEBODY', 'WHOLE BODY', 'WB'].includes(currentSeries.bodyPart.toUpperCase()) && (
                <Field
                  label={settings.expertMode ? 'Body Part' : 'Area'}
                  value={settings.expertMode ? currentSeries.bodyPart : getBodyRegionLabel(currentSeries.bodyPart)}
                />
              )}
            <Field
              label={settings.expertMode ? 'Image Count' : 'Total Slices'}
              value={String(currentSeries.images.length)}
            />
          </Section>
        )}

        {/* Image info (expert mode only) */}
        {settings.expertMode && currentImage && (
          <Section title="Image">
            <Field label="Instance Number" value={String(currentImage.instanceNumber)} />
            <Field label="Dimensions" value={`${currentImage.columns} × ${currentImage.rows}`} />
            {currentImage.sliceLocation !== undefined && (
              <Field label="Slice Location" value={currentImage.sliceLocation.toFixed(2)} />
            )}
            {currentImage.sliceThickness !== undefined && (
              <Field label="Slice Thickness" value={`${currentImage.sliceThickness.toFixed(2)} mm`} />
            )}
            {currentImage.windowCenter !== undefined && currentImage.windowWidth !== undefined && (
              <Field
                label="Window"
                value={`C: ${currentImage.windowCenter.toFixed(0)} W: ${currentImage.windowWidth.toFixed(0)}`}
              />
            )}
          </Section>
        )}

        {/* Help text for non-expert users */}
        {!settings.expertMode && (
          <div className="text-xs text-gray-500 leading-relaxed">
            <p className="mb-2">
              <strong className="text-gray-400">Tip:</strong> Each slice is a thin cross-section of your body,
              like a page in a book. Scroll through to see different depths.
            </p>
            <p>
              The brightness and contrast can be adjusted by clicking and dragging on the image.
            </p>
          </div>
        )}
      </div>

      {/* Settings footer */}
      <div className="p-4 border-t border-gray-700">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.expertMode}
            onChange={(e) => updateSettings({ expertMode: e.target.checked })}
            className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-accent focus:ring-accent focus:ring-offset-0"
          />
          <div>
            <div className="text-sm text-white">Expert Mode</div>
            <div className="text-xs text-gray-500">Show technical details</div>
          </div>
        </label>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-gray-400 text-xs uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-white text-sm text-right truncate" title={value}>
        {value}
      </span>
    </div>
  );
}
