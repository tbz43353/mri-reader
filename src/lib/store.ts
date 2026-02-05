import { useMemo } from 'react';
import { create } from 'zustand';
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
} from '../types';

interface ViewerState {
  // App state
  view: AppView;

  // Data
  study: DicomStudy | null;
  currentSeriesId: SeriesInstanceUID | null;
  currentSliceIndex: number;

  // UI
  isLoading: boolean;
  loadingProgress: LoadingProgress | null;
  error: string | null;

  // Settings
  settings: AppSettings;

  // Actions - App
  setView: (view: AppView) => void;

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

// Load settings from localStorage
function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem('mri-reader-settings');
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch {
    // Ignore localStorage errors
  }
  return DEFAULT_SETTINGS;
}

// Save settings to localStorage
function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem('mri-reader-settings', JSON.stringify(settings));
  } catch {
    // Ignore localStorage errors
  }
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  // Initial state
  view: 'dashboard',
  study: null,
  currentSeriesId: null,
  currentSliceIndex: 0,
  isLoading: false,
  loadingProgress: null,
  error: null,
  settings: loadSettings(),

  // App actions
  setView: (view) => set({ view }),

  // Study actions
  setStudy: (study) => set({
    study,
    currentSeriesId: study.series[0]?.seriesInstanceUID ?? null,
    currentSliceIndex: 0,
    error: null,
    view: 'viewer',
  }),

  clearStudy: () => set({
    study: null,
    currentSeriesId: null,
    currentSliceIndex: 0,
    view: 'dashboard',
  }),

  // Series actions
  selectSeries: (seriesId) => set({
    currentSeriesId: seriesId,
    currentSliceIndex: 0,
  }),

  // Slice navigation
  setSliceIndex: (index) => {
    const { study, currentSeriesId } = get();
    const series = study?.series.find(s => s.seriesInstanceUID === currentSeriesId);
    if (series) {
      const clampedIndex = Math.max(0, Math.min(index, series.images.length - 1));
      set({ currentSliceIndex: clampedIndex });
    }
  },

  nextSlice: () => {
    const { currentSliceIndex, setSliceIndex } = get();
    setSliceIndex(currentSliceIndex + 1);
  },

  prevSlice: () => {
    const { currentSliceIndex, setSliceIndex } = get();
    setSliceIndex(currentSliceIndex - 1);
  },

  goToFirstSlice: () => {
    set({ currentSliceIndex: 0 });
  },

  goToLastSlice: () => {
    const { study, currentSeriesId } = get();
    const series = study?.series.find(s => s.seriesInstanceUID === currentSeriesId);
    if (series && series.images.length > 0) {
      set({ currentSliceIndex: series.images.length - 1 });
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
  reset: () => set({
    view: 'dashboard',
    study: null,
    currentSeriesId: null,
    currentSliceIndex: 0,
    isLoading: false,
    loadingProgress: null,
    error: null,
  }),
}));

// Derived selectors
export function useCurrentSeries(): DicomSeries | null {
  const study = useViewerStore(s => s.study);
  const currentSeriesId = useViewerStore(s => s.currentSeriesId);
  return study?.series.find(s => s.seriesInstanceUID === currentSeriesId) ?? null;
}

export function useSliceCount(): number {
  const series = useCurrentSeries();
  return series?.images.length ?? 0;
}

export function useCurrentImage(): DicomImage | null {
  const series = useCurrentSeries();
  const currentSliceIndex = useViewerStore(s => s.currentSliceIndex);
  return series?.images[currentSliceIndex] ?? null;
}

// Reports selectors
export function useStudyReports(): DicomReport[] {
  const study = useViewerStore(s => s.study);
  return study?.reports ?? [];
}

export function useHasReports(): boolean {
  const reports = useStudyReports();
  return reports.length > 0;
}

// Key Object Selection selectors
export function useKeyObjectSelections(): KeyObjectSelection[] {
  const study = useViewerStore(s => s.study);
  return study?.keyObjectSelections ?? [];
}

/**
 * Returns a memoized Set of all key image SOP Instance UIDs.
 * Memoized to prevent creating a new Set on every render, which would
 * cause unnecessary re-renders in components using this hook.
 */
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

export function useIsCurrentImageKey(): boolean {
  const currentImage = useCurrentImage();
  const keyImageUIDs = useKeyImageUIDs();
  if (!currentImage) return false;
  return keyImageUIDs.has(currentImage.sopInstanceUID);
}

// Presentation State selectors
function usePresentationStates(): PresentationState[] {
  const study = useViewerStore(s => s.study);
  return study?.presentationStates ?? [];
}

/**
 * Returns a memoized Map from SOP Instance UID to PresentationState.
 * Provides O(1) lookup instead of O(n*m) when checking each image.
 */
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

export function useCurrentImagePresentationState(): PresentationState | null {
  const currentImage = useCurrentImage();
  const psMap = usePresentationStateMap();

  if (!currentImage) return null;

  // O(1) lookup using memoized map
  return psMap.get(currentImage.sopInstanceUID) ?? null;
}
