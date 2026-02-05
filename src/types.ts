// Branded types prevent mixing different UID types
type Brand<K, T> = K & { __brand: T };

export type StudyInstanceUID = Brand<string, 'StudyInstanceUID'>;
export type SeriesInstanceUID = Brand<string, 'SeriesInstanceUID'>;
export type SOPInstanceUID = Brand<string, 'SOPInstanceUID'>;

// Type guards for creating branded types
export function createStudyUID(uid: string): StudyInstanceUID {
  return uid as StudyInstanceUID;
}

export function createSeriesUID(uid: string): SeriesInstanceUID {
  return uid as SeriesInstanceUID;
}

export function createSOPUID(uid: string): SOPInstanceUID {
  return uid as SOPInstanceUID;
}

export interface DicomStudy {
  studyInstanceUID: StudyInstanceUID;
  patientName: string;
  patientId: string;
  studyDate: string;
  studyDescription: string;
  modality: string;
  institutionName?: string;
  referringPhysician?: string;
  series: DicomSeries[];
  // Non-image DICOM objects
  reports: DicomReport[];
  keyObjectSelections: KeyObjectSelection[];
  presentationStates: PresentationState[];
}

export interface DicomSeries {
  seriesInstanceUID: SeriesInstanceUID;
  studyInstanceUID: StudyInstanceUID;
  seriesNumber: number;
  seriesDescription: string;
  bodyPart?: string;
  modality: string;
  images: DicomImage[];
}

export interface DicomImage {
  sopInstanceUID: SOPInstanceUID;
  seriesInstanceUID: SeriesInstanceUID;
  instanceNumber: number;
  filePath: string;
  rows: number;
  columns: number;
  windowCenter?: number;
  windowWidth?: number;
  sliceLocation?: number;
  sliceThickness?: number;
  overlays?: GraphicOverlay[];
}

// Graphic Overlay - bitmap overlays embedded in images (DICOM group 60xx)
export interface GraphicOverlay {
  group: number; // 0x6000-0x601E (which overlay plane)
  rows: number;
  columns: number;
  type: 'G' | 'R'; // Graphics or ROI
  origin: [number, number]; // [row, column] offset from image origin
  bitsAllocated: number;
  data: Uint8Array; // Unpacked bitmap (1 byte per pixel)
  description?: string;
  label?: string;
}

// Structured Report (SR) - radiologist findings
export interface DicomReport {
  sopInstanceUID: SOPInstanceUID;
  seriesInstanceUID: SeriesInstanceUID;
  contentDate?: string;
  completionFlag: 'PARTIAL' | 'COMPLETE';
  verificationFlag: 'UNVERIFIED' | 'VERIFIED';
  findings: ReportFinding[];
}

export interface ReportFinding {
  conceptName: string; // "Finding", "Impression", etc.
  value: string; // The actual text
  valueType: 'TEXT' | 'NUM' | 'CODE' | 'CONTAINER' | 'IMAGE';
  unit?: string; // For measurements
  children?: ReportFinding[]; // Nested findings
  referencedImageUID?: string; // Link to image
}

// Key Object Selection (KO) - marked important images
export interface KeyObjectSelection {
  sopInstanceUID: SOPInstanceUID;
  title: string;
  description?: string;
  keyImages: SOPInstanceUID[]; // Referenced image SOP UIDs
}

// Presentation State (PR) - saved viewing settings
export interface PresentationState {
  sopInstanceUID: SOPInstanceUID;
  referencedImageUIDs: SOPInstanceUID[];
  windowCenter?: number;
  windowWidth?: number;
  presentationLabel?: string;
  graphicAnnotations?: GraphicAnnotation[];
}

export interface GraphicAnnotation {
  graphicType: 'POINT' | 'POLYLINE' | 'CIRCLE' | 'ELLIPSE' | 'TEXT';
  graphicData: number[]; // Coordinates in image pixel space
  textValue?: string;
}

export interface LoadingProgress {
  phase: 'scanning' | 'extracting' | 'parsing' | 'loading';
  current: number;
  total: number;
  currentFile?: string;
  message?: string;
}

// Viewing presets for non-expert users
export interface ViewingPreset {
  id: string;
  name: string;
  description: string;
  windowCenter: number;
  windowWidth: number;
  applicableModalities: string[];
}

// App view state
export type AppView = 'dashboard' | 'viewer';

// Settings
export interface AppSettings {
  expertMode: boolean;
  showTooltips: boolean;
  hasSeenOnboarding: boolean;
}
