import { useMemo } from 'react';
import { create } from 'zustand';
import { clearInMemoryFiles } from './dicom';
import { prefetchAdjacentSlices } from './cornerstone';
import type {
  DicomStudy,
  DicomSeries,
  DicomImage,
  DicomReport,
  KeyObjectSelection,
  PresentationState,
  SeriesInstanceUID,
  SOPInstanceUID,
  LoadingProgress,
  AppView,
  AppSettings,
  ImageAdjustments,
  ViewportLayout,
  ViewportSlot,
  ActiveTool,
  Measurement,
  CineState,
} from '../types';

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  gamma: 1.0,
  invert: false,
  activePreset: 'auto',
};

const DEFAULT_VIEWPORTS: ViewportSlot[] = [
  { id: 'mriReaderViewport-0', seriesInstanceUID: null, sliceIndex: 0 },
  { id: 'mriReaderViewport-1', seriesInstanceUID: null, sliceIndex: 0 },
  { id: 'mriReaderViewport-2', seriesInstanceUID: null, sliceIndex: 0 },
  { id: 'mriReaderViewport-3', seriesInstanceUID: null, sliceIndex: 0 },
];

interface ViewerState {
  // App state
  view: AppView;

  // Layout & Multi-Viewport state
  layout: ViewportLayout;
  activeViewportIndex: number;
  viewports: ViewportSlot[];

  // Cine Auto-Play (Movie Mode)
  cine: CineState;

  // Active Tool & Measurements
  activeTool: ActiveTool;
  measurements: Measurement[];

  // Display toggles
  showCornerOverlays: boolean;
  showOrientationMarkers: boolean;
  isLinkedScrolling: boolean;

  // Data (mirrors active viewport for backward compatibility)
  study: DicomStudy | null;
  currentSeriesId: SeriesInstanceUID | null;
  currentSliceIndex: number;

  // Visual adjustments
  adjustments: ImageAdjustments;

  // UI
  isLoading: boolean;
  loadingProgress: LoadingProgress | null;
  error: string | null;

  // Settings
  settings: AppSettings;

  // Actions - App & Layout
  setView: (view: AppView) => void;
  setLayout: (layout: ViewportLayout) => void;
  setActiveViewport: (index: number) => void;
  setViewportSeries: (index: number, seriesId: SeriesInstanceUID) => void;
  setViewportSliceIndex: (index: number, sliceIndex: number) => void;

  // Actions - Cine
  setCinePlaying: (isPlaying: boolean) => void;
  setCineFps: (fps: number) => void;
  toggleCine: () => void;
  toggleCineMode: () => void;

  // Actions - Tools & Measurements
  setActiveTool: (tool: ActiveTool) => void;
  addMeasurement: (measurement: Measurement) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;

  // Actions - Display Toggles
  toggleCornerOverlays: () => void;
  toggleOrientationMarkers: () => void;
  toggleLinkedScrolling: () => void;

  // Actions - Adjustments
  setBrightness: (brightness: number) => void;
  setContrast: (contrast: number) => void;
  setGamma: (gamma: number) => void;
  setInvert: (invert: boolean) => void;
  applyPreset: (presetId: string) => void;
  resetAdjustments: () => void;

  // Actions - Study
  setStudy: (study: DicomStudy) => void;
  clearStudy: () => void;

  // Actions - Series
  selectSeries: (seriesId: SeriesInstanceUID) => void;

  // Actions - Slice navigation
  setSliceIndex: (index: number) => void;
  nextSlice: () => void;
  prevSlice: () => void;
  goToFirstSlice: () => void;
  goToLastSlice: () => void;

  // Actions - Loading
  setLoading: (loading: boolean, progress?: LoadingProgress | null) => void;
  updateLoadingProgress: (progress: LoadingProgress) => void;

  // Actions - Error
  setError: (error: string | null) => void;
  clearError: () => void;

  // Actions - Settings
  updateSettings: (settings: Partial<AppSettings>) => void;

  // Actions - Reset
  reset: () => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  expertMode: false,
  showTooltips: true,
  hasSeenOnboarding: false,
};

function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem('mri-reader-settings');
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {
    // Ignore
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem('mri-reader-settings', JSON.stringify(settings));
  } catch {
    // Ignore
  }
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  // Initial state
  view: 'dashboard',
  study: null,
  currentSeriesId: null,
  currentSliceIndex: 0,
  layout: '1x1',
  activeViewportIndex: 0,
  viewports: DEFAULT_VIEWPORTS,

  cine: {
    isPlaying: false,
    fps: 15,
    mode: 'loop',
    direction: 1,
  },

  activeTool: 'pan',
  measurements: [],
  showCornerOverlays: true,
  showOrientationMarkers: true,
  isLinkedScrolling: false,

  adjustments: DEFAULT_ADJUSTMENTS,
  isLoading: false,
  loadingProgress: null,
  error: null,
  settings: loadSettings(),

  // App & Layout actions
  setView: (view) => set({ view }),

  setLayout: (layout) => {
    const { study, viewports } = get();
    if (!study || study.series.length === 0) {
      set({ layout });
      return;
    }

    const updated = [...viewports];
    const assigned = new Set<string>();
    if (updated[0].seriesInstanceUID) assigned.add(updated[0].seriesInstanceUID);

    const count = layout === '1x1' ? 1 : layout === '1x2' ? 2 : 4;
    for (let i = 1; i < count; i++) {
      if (!updated[i].seriesInstanceUID || updated[i].seriesInstanceUID === updated[0].seriesInstanceUID) {
        const unassigned = study.series.find((s) => !assigned.has(s.seriesInstanceUID));
        const chosen = unassigned || study.series[i % study.series.length];
        if (chosen) {
          updated[i] = { ...updated[i], seriesInstanceUID: chosen.seriesInstanceUID, sliceIndex: 0 };
          assigned.add(chosen.seriesInstanceUID);
        }
      }
    }

    set({ layout, viewports: updated });
  },

  setActiveViewport: (index) => {
    const { viewports } = get();
    const slot = viewports[index];
    if (slot) {
      set({
        activeViewportIndex: index,
        currentSeriesId: slot.seriesInstanceUID,
        currentSliceIndex: slot.sliceIndex,
      });
    }
  },

  setViewportSeries: (index, seriesId) => {
    const { viewports, activeViewportIndex } = get();
    const updated = viewports.map((v, i) =>
      i === index ? { ...v, seriesInstanceUID: seriesId, sliceIndex: 0 } : v
    );
    const newState: Partial<ViewerState> = { viewports: updated };
    if (index === activeViewportIndex) {
      newState.currentSeriesId = seriesId;
      newState.currentSliceIndex = 0;
    }
    set(newState);
  },

  setViewportSliceIndex: (index, sliceIndex) => {
    const { study, viewports, activeViewportIndex, isLinkedScrolling } = get();
    const slot = viewports[index];
    if (!slot) return;
    const series = study?.series.find((s) => s.seriesInstanceUID === slot.seriesInstanceUID);
    if (!series) return;

    const clampedIndex = Math.max(0, Math.min(sliceIndex, series.images.length - 1));
    const updated = viewports.map((v, i) => (i === index ? { ...v, sliceIndex: clampedIndex } : v));

    // Linked scrolling synchronization across viewports
    if (isLinkedScrolling && index === activeViewportIndex && series.images.length > 1) {
      const progress = clampedIndex / (series.images.length - 1);
      const visibleCount = get().layout === '1x1' ? 1 : get().layout === '1x2' ? 2 : 4;
      for (let i = 0; i < visibleCount; i++) {
        if (i !== index) {
          const otherSlot = updated[i];
          const otherSeries = study?.series.find((s) => s.seriesInstanceUID === otherSlot.seriesInstanceUID);
          if (otherSeries && otherSeries.images.length > 1) {
            const syncedSlice = Math.round(progress * (otherSeries.images.length - 1));
            updated[i] = { ...otherSlot, sliceIndex: syncedSlice };
          }
        }
      }
    }

    // Predictive prefetch of adjacent slices
    const filePaths = series.images.map((img) => img.filePath);
    prefetchAdjacentSlices(filePaths, clampedIndex);

    const newState: Partial<ViewerState> = { viewports: updated };
    if (index === activeViewportIndex) {
      newState.currentSliceIndex = clampedIndex;
    }
    set(newState);
  },

  // Cine actions
  setCinePlaying: (isPlaying) => {
    set((state) => ({ cine: { ...state.cine, isPlaying } }));
  },

  setCineFps: (fps) => {
    set((state) => ({ cine: { ...state.cine, fps: Math.max(1, Math.min(60, fps)) } }));
  },

  toggleCine: () => {
    set((state) => ({ cine: { ...state.cine, isPlaying: !state.cine.isPlaying } }));
  },

  toggleCineMode: () => {
    set((state) => ({
      cine: {
        ...state.cine,
        mode: state.cine.mode === 'loop' ? 'ping-pong' : 'loop',
      },
    }));
  },

  // Tools & Measurements
  setActiveTool: (activeTool) => set({ activeTool }),

  addMeasurement: (measurement) => {
    set((state) => ({ measurements: [...state.measurements, measurement] }));
  },

  removeMeasurement: (id) => {
    set((state) => ({ measurements: state.measurements.filter((m) => m.id !== id) }));
  },

  clearMeasurements: () => set({ measurements: [] }),

  // Display toggles
  toggleCornerOverlays: () => {
    set((state) => ({ showCornerOverlays: !state.showCornerOverlays }));
  },

  toggleOrientationMarkers: () => {
    set((state) => ({ showOrientationMarkers: !state.showOrientationMarkers }));
  },

  toggleLinkedScrolling: () => {
    set((state) => ({ isLinkedScrolling: !state.isLinkedScrolling }));
  },

  // Adjustments actions
  setBrightness: (brightness) =>
    set((state) => ({
      adjustments: { ...state.adjustments, brightness, activePreset: 'custom' },
    })),

  setContrast: (contrast) =>
    set((state) => ({
      adjustments: { ...state.adjustments, contrast, activePreset: 'custom' },
    })),

  setGamma: (gamma) =>
    set((state) => ({
      adjustments: { ...state.adjustments, gamma, activePreset: 'custom' },
    })),

  setInvert: (invert) =>
    set((state) => ({
      adjustments: { ...state.adjustments, invert },
    })),

  applyPreset: (presetId) =>
    set((state) => ({
      adjustments: {
        ...state.adjustments,
        brightness: 0,
        contrast: 0,
        activePreset: presetId,
      },
    })),

  resetAdjustments: () =>
    set({
      adjustments: DEFAULT_ADJUSTMENTS,
    }),

  // Study actions
  setStudy: (study) => {
    const series0 = study.series[0]?.seriesInstanceUID ?? null;
    const series1 = study.series[1]?.seriesInstanceUID ?? series0;
    const series2 = study.series[2]?.seriesInstanceUID ?? series0;
    const series3 = study.series[3]?.seriesInstanceUID ?? series1;

    const initialViewports: ViewportSlot[] = [
      { id: 'mriReaderViewport-0', seriesInstanceUID: series0, sliceIndex: 0 },
      { id: 'mriReaderViewport-1', seriesInstanceUID: series1, sliceIndex: 0 },
      { id: 'mriReaderViewport-2', seriesInstanceUID: series2, sliceIndex: 0 },
      { id: 'mriReaderViewport-3', seriesInstanceUID: series3, sliceIndex: 0 },
    ];

    set({
      study,
      currentSeriesId: series0,
      currentSliceIndex: 0,
      layout: '1x1',
      activeViewportIndex: 0,
      viewports: initialViewports,
      adjustments: DEFAULT_ADJUSTMENTS,
      measurements: [],
      cine: { isPlaying: false, fps: 15, mode: 'loop', direction: 1 },
      error: null,
      view: 'viewer',
    });
  },

  clearStudy: () => {
    clearInMemoryFiles();
    set({
      study: null,
      currentSeriesId: null,
      currentSliceIndex: 0,
      layout: '1x1',
      activeViewportIndex: 0,
      viewports: DEFAULT_VIEWPORTS,
      measurements: [],
      cine: { isPlaying: false, fps: 15, mode: 'loop', direction: 1 },
      adjustments: DEFAULT_ADJUSTMENTS,
      view: 'dashboard',
    });
  },

  // Series actions (affects active viewport)
  selectSeries: (seriesId) => {
    const { activeViewportIndex, setViewportSeries } = get();
    setViewportSeries(activeViewportIndex, seriesId);
  },

  // Slice navigation (affects active viewport)
  setSliceIndex: (index) => {
    const { activeViewportIndex, setViewportSliceIndex } = get();
    setViewportSliceIndex(activeViewportIndex, index);
  },

  nextSlice: () => {
    const { viewports, activeViewportIndex, setViewportSliceIndex } = get();
    const currentSlice = viewports[activeViewportIndex]?.sliceIndex ?? 0;
    setViewportSliceIndex(activeViewportIndex, currentSlice + 1);
  },

  prevSlice: () => {
    const { viewports, activeViewportIndex, setViewportSliceIndex } = get();
    const currentSlice = viewports[activeViewportIndex]?.sliceIndex ?? 0;
    setViewportSliceIndex(activeViewportIndex, currentSlice - 1);
  },

  goToFirstSlice: () => {
    const { activeViewportIndex, setViewportSliceIndex } = get();
    setViewportSliceIndex(activeViewportIndex, 0);
  },

  goToLastSlice: () => {
    const { study, viewports, activeViewportIndex, setViewportSliceIndex } = get();
    const slot = viewports[activeViewportIndex];
    if (!slot) return;
    const series = study?.series.find((s) => s.seriesInstanceUID === slot.seriesInstanceUID);
    if (series && series.images.length > 0) {
      setViewportSliceIndex(activeViewportIndex, series.images.length - 1);
    }
  },

  // Loading actions
  setLoading: (isLoading, loadingProgress = null) => set({ isLoading, loadingProgress }),

  updateLoadingProgress: (progress) => set({ loadingProgress: progress }),

  // Error actions
  setError: (error) => set({ error, isLoading: false, loadingProgress: null }),

  clearError: () => set({ error: null }),

  // Settings actions
  updateSettings: (newSettings) => {
    const settings = { ...get().settings, ...newSettings };
    saveSettings(settings);
    set({ settings });
  },

  // Reset
  reset: () => {
    clearInMemoryFiles();
    set({
      view: 'dashboard',
      study: null,
      currentSeriesId: null,
      currentSliceIndex: 0,
      layout: '1x1',
      activeViewportIndex: 0,
      viewports: DEFAULT_VIEWPORTS,
      measurements: [],
      cine: { isPlaying: false, fps: 15, mode: 'loop', direction: 1 },
      adjustments: DEFAULT_ADJUSTMENTS,
      isLoading: false,
      loadingProgress: null,
      error: null,
    });
  },
}));

// Derived selectors
export function useCurrentSeries(viewportIndex?: number): DicomSeries | null {
  const study = useViewerStore((s) => s.study);
  const activeIndex = useViewerStore((s) => s.activeViewportIndex);
  const targetIndex = viewportIndex !== undefined ? viewportIndex : activeIndex;
  const slotSeriesId = useViewerStore((s) => s.viewports[targetIndex]?.seriesInstanceUID);
  return study?.series.find((s) => s.seriesInstanceUID === slotSeriesId) ?? null;
}

export function useSliceCount(viewportIndex?: number): number {
  const series = useCurrentSeries(viewportIndex);
  return series?.images.length ?? 0;
}

export function useCurrentImage(viewportIndex?: number): DicomImage | null {
  const series = useCurrentSeries(viewportIndex);
  const activeIndex = useViewerStore((s) => s.activeViewportIndex);
  const targetIndex = viewportIndex !== undefined ? viewportIndex : activeIndex;
  const sliceIndex = useViewerStore((s) => s.viewports[targetIndex]?.sliceIndex ?? 0);
  return series?.images[sliceIndex] ?? null;
}

export function useLayout(): ViewportLayout {
  return useViewerStore((s) => s.layout);
}

export function useActiveViewportIndex(): number {
  return useViewerStore((s) => s.activeViewportIndex);
}

export function useViewportSlot(index: number): ViewportSlot | undefined {
  return useViewerStore((s) => s.viewports[index]);
}

export function useActiveTool(): ActiveTool {
  return useViewerStore((s) => s.activeTool);
}

export function useMeasurements(): Measurement[] {
  return useViewerStore((s) => s.measurements);
}

export function useCineState(): CineState {
  return useViewerStore((s) => s.cine);
}

export function useStudyReports(): DicomReport[] {
  const study = useViewerStore((s) => s.study);
  return study?.reports ?? [];
}

export function useHasReports(): boolean {
  const reports = useStudyReports();
  return reports.length > 0;
}

export function useKeyObjectSelections(): KeyObjectSelection[] {
  const study = useViewerStore((s) => s.study);
  return study?.keyObjectSelections ?? [];
}

export function useKeyImageUIDs(): Set<SOPInstanceUID> {
  const keyObjects = useKeyObjectSelections();
  return useMemo(() => {
    const uids = new Set<SOPInstanceUID>();
    for (const ko of keyObjects) {
      for (const uid of ko.keyImages) {
        uids.add(uid);
      }
    }
    return uids;
  }, [keyObjects]);
}

export function useIsCurrentImageKey(viewportIndex?: number): boolean {
  const currentImage = useCurrentImage(viewportIndex);
  const keyImageUIDs = useKeyImageUIDs();
  if (!currentImage) return false;
  return keyImageUIDs.has(currentImage.sopInstanceUID);
}

function usePresentationStates(): PresentationState[] {
  const study = useViewerStore((s) => s.study);
  return study?.presentationStates ?? [];
}

function usePresentationStateMap(): Map<SOPInstanceUID, PresentationState> {
  const presentationStates = usePresentationStates();
  return useMemo(() => {
    const map = new Map<SOPInstanceUID, PresentationState>();
    for (const ps of presentationStates) {
      for (const uid of ps.referencedImageUIDs) {
        map.set(uid, ps);
      }
    }
    return map;
  }, [presentationStates]);
}

export function useCurrentImagePresentationState(viewportIndex?: number): PresentationState | null {
  const currentImage = useCurrentImage(viewportIndex);
  const psMap = usePresentationStateMap();
  if (!currentImage) return null;
  return psMap.get(currentImage.sopInstanceUID) ?? null;
}
