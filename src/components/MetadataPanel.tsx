import { useState } from 'react';
import { useViewerStore, useCurrentSeries, useCurrentImage } from '../lib/store';
import { toPlainLanguage, getBodyRegionLabel, simplifySeriesDescription, getPresetsForModality } from '../lib/terminology';
import { applyAdjustments, resetViewport } from '../lib/cornerstone';

export default function MetadataPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'adjustments' | 'info'>('adjustments');

  const study = useViewerStore((s) => s.study);
  const settings = useViewerStore((s) => s.settings);
  const updateSettings = useViewerStore((s) => s.updateSettings);

  const adjustments = useViewerStore((s) => s.adjustments);
  const setBrightness = useViewerStore((s) => s.setBrightness);
  const setContrast = useViewerStore((s) => s.setContrast);
  const setGamma = useViewerStore((s) => s.setGamma);
  const setInvert = useViewerStore((s) => s.setInvert);
  const applyPreset = useViewerStore((s) => s.applyPreset);
  const resetAdjustments = useViewerStore((s) => s.resetAdjustments);

  const currentSeries = useCurrentSeries();
  const currentImage = useCurrentImage();

  if (!study) return null;

  // Floating button to reopen panel when collapsed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 bg-accent text-white p-3 rounded-full shadow-xl hover:bg-accent-hover transition-all z-20 flex items-center gap-2 group"
        aria-label="Open adjustments & scan info"
        title="Open adjustments & scan info"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        <span className="text-xs font-medium pr-1 max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-200 whitespace-nowrap">
          Controls
        </span>
      </button>
    );
  }

  const presets = currentSeries ? getPresetsForModality(currentSeries.modality) : [];

  // Handlers for adjustments
  const handleBrightnessChange = (val: number) => {
    setBrightness(val);
    applyAdjustments(val, adjustments.contrast, adjustments.invert, 'custom');
  };

  const handleContrastChange = (val: number) => {
    setContrast(val);
    applyAdjustments(adjustments.brightness, val, adjustments.invert, 'custom');
  };

  const handleGammaChange = (val: number) => {
    setGamma(val);
  };

  const handleInvertToggle = () => {
    const nextInvert = !adjustments.invert;
    setInvert(nextInvert);
    applyAdjustments(adjustments.brightness, adjustments.contrast, nextInvert, adjustments.activePreset);
  };

  const handlePresetSelect = (presetId: string) => {
    applyPreset(presetId);
    applyAdjustments(0, 0, adjustments.invert, presetId);
  };

  const handleResetAll = () => {
    resetAdjustments();
    resetViewport();
  };

  return (
    <aside className="w-80 bg-panel-bg border-l border-gray-700 flex flex-col h-full z-10 transition-all duration-200 select-none">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        {/* Tab switcher */}
        <div className="flex bg-gray-800/80 p-0.5 rounded-lg border border-gray-700">
          <button
            onClick={() => setActiveTab('adjustments')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'adjustments'
                ? 'bg-accent text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Adjustments
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              activeTab === 'info'
                ? 'bg-accent text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Scan Info
          </button>
        </div>

        {/* Collapse button */}
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded transition-colors"
          aria-label="Collapse panel"
          title="Collapse panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === 'adjustments' ? (
          <>
            {/* Brightness Control */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                  <span>☀️</span> Brightness
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">
                    {adjustments.brightness > 0 ? `+${adjustments.brightness}` : adjustments.brightness}%
                  </span>
                  {adjustments.brightness !== 0 && (
                    <button
                      onClick={() => handleBrightnessChange(0)}
                      className="text-[10px] text-gray-500 hover:text-accent underline"
                      title="Reset brightness"
                    >
                      reset
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={adjustments.brightness}
                onChange={(e) => handleBrightnessChange(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent"
              />
            </div>

            {/* Contrast Control */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                  <span>🌓</span> Contrast
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">
                    {adjustments.contrast > 0 ? `+${adjustments.contrast}` : adjustments.contrast}%
                  </span>
                  {adjustments.contrast !== 0 && (
                    <button
                      onClick={() => handleContrastChange(0)}
                      className="text-[10px] text-gray-500 hover:text-accent underline"
                      title="Reset contrast"
                    >
                      reset
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={adjustments.contrast}
                onChange={(e) => handleContrastChange(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent"
              />
            </div>

            {/* Gamma Control */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                  <span>🎚️</span> Gamma (Midtones)
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">
                    {adjustments.gamma.toFixed(2)}x
                  </span>
                  {Math.abs(adjustments.gamma - 1.0) > 0.01 && (
                    <button
                      onClick={() => handleGammaChange(1.0)}
                      className="text-[10px] text-gray-500 hover:text-accent underline"
                      title="Reset gamma to 1.0"
                    >
                      reset
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={0.4}
                max={2.2}
                step={0.05}
                value={adjustments.gamma}
                onChange={(e) => handleGammaChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <p className="text-[11px] text-gray-500">
                Enhances subtle soft tissue & spinal cord midtones
              </p>
            </div>

            {/* Presets */}
            <div className="space-y-2 pt-2 border-t border-gray-700/60">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Viewing Presets
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {presets.map((preset) => {
                  const isActive = adjustments.activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetSelect(preset.id)}
                      className={`px-2.5 py-1.5 text-xs rounded border transition-colors text-left truncate ${
                        isActive
                          ? 'bg-accent/20 border-accent text-accent font-medium'
                          : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                      title={preset.description}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Invert & Reset Actions */}
            <div className="pt-2 border-t border-gray-700/60 space-y-2">
              <button
                onClick={handleInvertToggle}
                className={`w-full py-2 px-3 text-xs rounded-lg border font-medium flex items-center justify-center gap-2 transition-colors ${
                  adjustments.invert
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <span>☯</span>
                <span>{adjustments.invert ? 'Inverted (Negative)' : 'Invert Black / White'}</span>
              </button>

              <button
                onClick={handleResetAll}
                className="w-full py-2 px-3 text-xs rounded-lg border border-gray-700 bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Reset All Adjustments</span>
              </button>
            </div>

            {/* Gesture Quick Guide Card */}
            <div className="p-3 bg-gray-800/50 rounded-xl border border-gray-700/60 space-y-2">
              <div className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <span>✨</span> Viewport Gestures
              </div>
              <ul className="text-xs text-gray-400 space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="text-base leading-none">🖐️</span>
                  <span><strong>Left Drag:</strong> Pan image</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-base leading-none">🤏</span>
                  <span><strong>2-Finger Pinch:</strong> Zoom in / out</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-base leading-none">✌️</span>
                  <span><strong>2-Finger Scroll:</strong> Pan image</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-base leading-none">🖱️</span>
                  <span><strong>Right Drag:</strong> Zoom in / out</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-base leading-none">↔️</span>
                  <span><strong>Bottom Slider / Keys:</strong> Browse slices</span>
                </li>
              </ul>
            </div>
          </>
        ) : (
          /* Scan Information Tab */
          <>
            <Section title={settings.expertMode ? 'Study Information' : 'Patient Information'}>
              <Field label={settings.expertMode ? 'Patient Name' : 'Name'} value={study.patientName} />
              {study.patientId && <Field label="Patient ID" value={study.patientId} />}
              <Field label={settings.expertMode ? 'Study Date' : 'Date'} value={study.studyDate} />
              {study.studyDescription && (
                <Field label="Description" value={study.studyDescription} />
              )}
              <Field
                label={settings.expertMode ? 'Modality' : 'Scan Type'}
                value={toPlainLanguage(study.modality, settings.expertMode)}
              />
              {study.institutionName && (
                <Field label="Institution" value={study.institutionName} />
              )}
            </Section>

            {currentSeries && (
              <Section title={settings.expertMode ? 'Series Information' : 'Current Sequence'}>
                <Field
                  label={settings.expertMode ? 'Description' : 'Sequence'}
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
                {currentSeries.bodyPart && (
                  <Field
                    label={settings.expertMode ? 'Body Part' : 'Area'}
                    value={settings.expertMode ? currentSeries.bodyPart : getBodyRegionLabel(currentSeries.bodyPart)}
                  />
                )}
                <Field
                  label={settings.expertMode ? 'Images Count' : 'Total Slices'}
                  value={String(currentSeries.images.length)}
                />
              </Section>
            )}

            {currentImage && (
              <Section title="Slice Technical Data">
                <Field label="Slice Index" value={`${useViewerStore.getState().currentSliceIndex + 1} of ${currentSeries?.images.length || 0}`} />
                <Field label="Dimensions" value={`${currentImage.columns} × ${currentImage.rows} px`} />
                {currentImage.sliceLocation !== undefined && (
                  <Field label="Slice Location" value={`${currentImage.sliceLocation.toFixed(2)} mm`} />
                )}
                {currentImage.sliceThickness !== undefined && (
                  <Field label="Slice Thickness" value={`${currentImage.sliceThickness.toFixed(2)} mm`} />
                )}
                {currentImage.windowCenter !== undefined && currentImage.windowWidth !== undefined && (
                  <Field
                    label="DICOM Window"
                    value={`C: ${currentImage.windowCenter.toFixed(0)}  W: ${currentImage.windowWidth.toFixed(0)}`}
                  />
                )}
              </Section>
            )}

            {/* Expert Mode toggle */}
            <div className="pt-2 border-t border-gray-700/60">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.expertMode}
                  onChange={(e) => updateSettings({ expertMode: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-accent focus:ring-accent focus:ring-offset-0"
                />
                <div>
                  <div className="text-xs font-medium text-white">Expert Mode</div>
                  <div className="text-[11px] text-gray-500">Show technical DICOM tags</div>
                </div>
              </label>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-gray-400 text-xs uppercase tracking-wider mb-2 font-medium">{title}</h4>
      <div className="space-y-1.5 bg-gray-800/40 p-2.5 rounded-lg border border-gray-700/40">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="text-white text-right truncate font-medium" title={value}>
        {value}
      </span>
    </div>
  );
}
