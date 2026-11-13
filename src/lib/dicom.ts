import dicomParser from 'dicom-parser';
import type {
  DicomStudy,
  DicomSeries,
  DicomImage,
  DicomReport,
  KeyObjectSelection,
  PresentationState,
  GraphicOverlay,
  LoadingProgress,
  SeriesInstanceUID,
} from '../types';
import { createStudyUID, createSeriesUID, createSOPUID } from '../types';
import { isSRFile, parseSR } from './dicom-sr';
import { isKOFile, parseKO } from './dicom-ko';
import { isPRFile, parsePR } from './dicom-pr';
import { formatDicomDate } from './dicom-utils';

// Security limits
const DICOM_SECURITY = {
  maxFileSize: 500 * 1024 * 1024, // 500MB
  parseTimeout: 30000, // 30 seconds
};

// Known non-DICOM extensions to ignore
const NON_DICOM_EXTENSIONS = new Set([
  '.zip', '.gz', '.tar', '.rar', '.7z',
  '.json', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.bmp', '.tiff', '.tif',
  '.xml', '.html', '.css', '.js', '.ts', '.md', '.csv', '.log',
  '.exe', '.dll', '.dylib', '.so',
]);

export function isPotentialDicomFile(name: string): boolean {
  if (name.startsWith('.') || name.startsWith('._') || name === 'Thumbs.db') {
    return false;
  }
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1) return true; // Files without extension are common in DICOM
  const ext = name.slice(lastDot).toLowerCase();
  if (NON_DICOM_EXTENSIONS.has(ext)) {
    return false;
  }
  return true;
}

// In-memory file cache for web browser mode
const inMemoryFileStore = new Map<string, Uint8Array | File>();

export function registerInMemoryFile(path: string, fileOrData: Uint8Array | File): void {
  inMemoryFileStore.set(path, fileOrData);
}

export function clearInMemoryFiles(): void {
  inMemoryFileStore.clear();
}

// Safe helper to convert any Buffer/ArrayBuffer/Uint8Array to Uint8Array
export function toUint8Array(buffer: Uint8Array | ArrayBuffer | Buffer | unknown): Uint8Array {
  if (buffer instanceof Uint8Array) {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer);
  }
  return new Uint8Array(buffer as ArrayLike<number>);
}

/**
 * Unified DICOM buffer reader that works seamlessly in both
 * standalone web browser mode (via in-memory File/Uint8Array)
 * and Electron desktop mode (via IPC readFile).
 */
export async function readDicomBuffer(filePath: string): Promise<Uint8Array> {
  const inMemory = inMemoryFileStore.get(filePath);
  if (inMemory) {
    if (inMemory instanceof Uint8Array) {
      return inMemory;
    }
    const arrayBuf = await inMemory.arrayBuffer();
    return new Uint8Array(arrayBuf);
  }

  if (typeof window !== 'undefined' && window.electronAPI) {
    const rawBuffer = await window.electronAPI.readFile(filePath);
    return toUint8Array(rawBuffer);
  }

  throw new Error(`File not found: ${filePath}`);
}

// Result type for parsing a single DICOM file
type ParseResult =
  | {
      type: 'image';
      data: DicomImage;
      seriesMeta: Partial<DicomSeries>;
      studyMeta?: Partial<DicomStudy>;
    }
  | { type: 'report'; data: DicomReport; studyMeta?: Partial<DicomStudy> }
  | { type: 'keyObject'; data: KeyObjectSelection; studyMeta?: Partial<DicomStudy> }
  | { type: 'presentationState'; data: PresentationState; studyMeta?: Partial<DicomStudy> }
  | null;

// Parse a single DICOM file and extract metadata
async function parseDicomFile(filePath: string): Promise<ParseResult> {
  try {
    const byteArray = await readDicomBuffer(filePath);

    // Security: Check file size
    if (byteArray.byteLength > DICOM_SECURITY.maxFileSize) {
      console.warn(`File too large, skipping: ${filePath}`);
      return null;
    }

    // Parse DICOM
    const dataSet = dicomParser.parseDicom(byteArray);

    // Study metadata if available in this dataset
    const studyInstanceUID = dataSet.string('x0020000d');
    const studyMeta: Partial<DicomStudy> | undefined = studyInstanceUID
      ? {
          studyInstanceUID: createStudyUID(studyInstanceUID),
          patientName: (dataSet.string('x00100010') ?? 'Unknown').replace(/\^/g, ' ').trim(),
          patientId: dataSet.string('x00100020') ?? '',
          studyDate: formatDicomDate(dataSet.string('x00080020')),
          studyDescription: dataSet.string('x00081030') ?? '',
          modality: dataSet.string('x00080060') ?? '',
          institutionName: dataSet.string('x00080080') ?? undefined,
          referringPhysician: dataSet.string('x00080090') ?? undefined,
        }
      : undefined;

    // Check for non-image DICOM types FIRST (before pixel data check)
    // Structured Report
    if (isSRFile(dataSet)) {
      const report = parseSR(dataSet, filePath);
      return report ? { type: 'report', data: report, studyMeta } : null;
    }

    // Key Object Selection
    if (isKOFile(dataSet)) {
      const ko = parseKO(dataSet, filePath);
      return ko ? { type: 'keyObject', data: ko, studyMeta } : null;
    }

    // Presentation State
    if (isPRFile(dataSet)) {
      const pr = parsePR(dataSet, filePath);
      return pr ? { type: 'presentationState', data: pr, studyMeta } : null;
    }

    // Check for pixel data (standard 7FE0,0010, float 7FE0,0008, or double float 7FE0,0009)
    const pixelDataElement =
      dataSet.elements['x7fe00010'] ||
      dataSet.elements['x7fe00008'] ||
      dataSet.elements['x7fe00009'];
    if (!pixelDataElement) {
      // Unknown non-image file type
      return null;
    }

    // Extract required fields for images
    const sopInstanceUID = dataSet.string('x00080018');
    const seriesInstanceUID = dataSet.string('x0020000e');
    const rawInstanceNumber = dataSet.intString('x00200013');
    const instanceNumber = typeof rawInstanceNumber === 'number' && !Number.isNaN(rawInstanceNumber)
      ? rawInstanceNumber
      : 0;
    const rows = dataSet.uint16('x00280010') ?? 0;
    const columns = dataSet.uint16('x00280011') ?? 0;

    if (!sopInstanceUID || !seriesInstanceUID) {
      console.warn(`Missing UIDs, skipping: ${filePath}`);
      return null;
    }

    // Extract optional fields
    const windowCenter = dataSet.floatString('x00281050');
    const windowWidth = dataSet.floatString('x00281051');
    const sliceLocation = dataSet.floatString('x00201041');
    const sliceThickness = dataSet.floatString('x00180050');

    // Extract Image Position (Patient) (0020,0032)
    let imagePositionPatient: [number, number, number] | undefined;
    const ippStr = dataSet.string('x00200032');
    if (ippStr) {
      const parts = ippStr.split('\\').map((p) => parseFloat(p.trim()));
      if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
        imagePositionPatient = [parts[0], parts[1], parts[2]];
      }
    }

    // Extract Image Orientation (Patient) (0020,0037)
    let imageOrientationPatient: [number, number, number, number, number, number] | undefined;
    const iopStr = dataSet.string('x00200037');
    if (iopStr) {
      const parts = iopStr.split('\\').map((p) => parseFloat(p.trim()));
      if (parts.length === 6 && parts.every((n) => !Number.isNaN(n))) {
        imageOrientationPatient = [
          parts[0], parts[1], parts[2],
          parts[3], parts[4], parts[5],
        ];
      }
    }

    // Extract Pixel Spacing (0028,0030)
    let pixelSpacing: [number, number] | undefined;
    const psStr = dataSet.string('x00280030');
    if (psStr) {
      const parts = psStr.split('\\').map((p) => parseFloat(p.trim()));
      if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) {
        pixelSpacing = [parts[0], parts[1]];
      }
    }

    // Parse graphic overlays (embedded in images)
    const overlays = parseOverlays(dataSet);

    const rawSeriesNumber = dataSet.intString('x00200011');
    const seriesNumber = typeof rawSeriesNumber === 'number' && !Number.isNaN(rawSeriesNumber)
      ? rawSeriesNumber
      : 0;

    const seriesMeta: Partial<DicomSeries> = {
      seriesInstanceUID: createSeriesUID(seriesInstanceUID),
      studyInstanceUID: studyInstanceUID ? createStudyUID(studyInstanceUID) : undefined,
      seriesNumber,
      seriesDescription: dataSet.string('x0008103e') ?? '',
      bodyPart: dataSet.string('x00180015') ?? undefined,
      modality: dataSet.string('x00080060') ?? '',
    };

    return {
      type: 'image',
      data: {
        sopInstanceUID: createSOPUID(sopInstanceUID),
        seriesInstanceUID: createSeriesUID(seriesInstanceUID),
        instanceNumber,
        filePath,
        rows,
        columns,
        windowCenter: windowCenter ?? undefined,
        windowWidth: windowWidth ?? undefined,
        sliceLocation: sliceLocation ?? undefined,
        sliceThickness: sliceThickness ?? undefined,
        imagePositionPatient,
        imageOrientationPatient,
        pixelSpacing,
        overlays: overlays.length > 0 ? overlays : undefined,
      },
      seriesMeta,
      studyMeta,
    };
  } catch (err) {
    console.warn(`Failed to parse DICOM file: ${filePath}`, err);
    return null;
  }
}

// Parse graphic overlays from DICOM group 60xx
function parseOverlays(dataSet: dicomParser.DataSet): GraphicOverlay[] {
  const overlays: GraphicOverlay[] = [];

  // Check all 16 possible overlay groups (6000, 6002, 6004, ... 601E)
  for (let group = 0x6000; group <= 0x601e; group += 2) {
    const prefix = group.toString(16).padStart(4, '0');

    // Check if this overlay exists by looking for Overlay Rows
    const rows = dataSet.uint16(`x${prefix}0010`);
    if (!rows) continue;

    const columns = dataSet.uint16(`x${prefix}0011`);
    if (!columns) continue;

    const type = (dataSet.string(`x${prefix}0040`) ?? 'G') as 'G' | 'R';

    // Overlay Origin (0050) - row\column format
    const originStr = dataSet.string(`x${prefix}0050`);
    let origin: [number, number] = [1, 1];
    if (originStr) {
      const parts = originStr.split('\\').map(Number);
      if (parts.length >= 2 && !parts.some(isNaN)) {
        origin = [parts[0], parts[1]];
      }
    }

    // Get overlay data (packed bits)
    const dataElement = dataSet.elements[`x${prefix}3000`];
    if (!dataElement) continue;

    // Unpack bits to bytes for easier rendering
    const packedData = new Uint8Array(
      dataSet.byteArray.buffer,
      dataSet.byteArray.byteOffset + dataElement.dataOffset,
      dataElement.length
    );
    const unpackedData = unpackOverlayBits(packedData, rows * columns);

    overlays.push({
      group,
      rows,
      columns,
      type,
      origin,
      bitsAllocated: 1,
      data: unpackedData,
      description: dataSet.string(`x${prefix}0022`) ?? undefined,
      label: dataSet.string(`x${prefix}1500`) ?? undefined,
    });
  }

  return overlays;
}

// Unpack 1-bit packed overlay data to 1-byte per pixel
function unpackOverlayBits(packed: Uint8Array, numPixels: number): Uint8Array {
  const unpacked = new Uint8Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = i % 8;
    if (byteIndex < packed.length) {
      unpacked[i] = (packed[byteIndex] >> bitIndex) & 1;
    }
  }
  return unpacked;
}

// Load DICOM study from a list of file paths
export async function loadDicomFromFolder(
  filePaths: string[],
  onProgress: (progress: LoadingProgress) => void
): Promise<DicomStudy | null> {
  if (filePaths.length === 0) {
    return null;
  }

  onProgress({ phase: 'parsing', current: 0, total: filePaths.length, message: 'Reading DICOM files...' });

  let studyMetadata: Partial<DicomStudy> | null = null;
  const images: DicomImage[] = [];
  const reports: DicomReport[] = [];
  const keyObjectSelections: KeyObjectSelection[] = [];
  const presentationStates: PresentationState[] = [];
  const seriesMap = new Map<SeriesInstanceUID, DicomSeries>();

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];

    onProgress({
      phase: 'parsing',
      current: i + 1,
      total: filePaths.length,
      currentFile: filePath.split('/').pop(),
    });

    const result = await parseDicomFile(filePath);
    if (!result) continue;

    // Capture study metadata from the first valid object that contains it
    if (!studyMetadata && result.studyMeta?.studyInstanceUID) {
      studyMetadata = result.studyMeta;
    }

    // Handle different DICOM object types
    switch (result.type) {
      case 'image': {
        const image = result.data;
        images.push(image);

        // Create or update series directly using the parsed metadata (no redundant file read)
        if (!seriesMap.has(image.seriesInstanceUID)) {
          seriesMap.set(image.seriesInstanceUID, {
            ...result.seriesMeta,
            images: [],
          } as DicomSeries);
        }
        break;
      }
      case 'report':
        reports.push(result.data);
        break;
      case 'keyObject':
        keyObjectSelections.push(result.data);
        break;
      case 'presentationState':
        presentationStates.push(result.data);
        break;
    }
  }

  // Organize images into series
  for (const image of images) {
    const series = seriesMap.get(image.seriesInstanceUID);
    if (series) {
      series.images.push(image);
    }
  }

  // Sort images by instance number within each series
  for (const series of seriesMap.values()) {
    series.images.sort((a, b) => a.instanceNumber - b.instanceNumber);
  }

  // Sort series by series number
  const sortedSeries = Array.from(seriesMap.values()).sort(
    (a, b) => a.seriesNumber - b.seriesNumber
  );

  if (sortedSeries.length === 0) {
    return null;
  }

  // Fallback study metadata if not explicitly found in headers
  if (!studyMetadata) {
    const firstSeries = sortedSeries[0];
    studyMetadata = {
      studyInstanceUID: firstSeries.studyInstanceUID || createStudyUID('unknown-study'),
      patientName: 'Unknown',
      patientId: '',
      studyDate: 'Unknown Date',
      studyDescription: firstSeries.seriesDescription || 'MRI Study',
      modality: firstSeries.modality || 'MR',
    };
  }

  // Log non-image objects found
  if (reports.length > 0) {
    console.log(`[DICOM] Found ${reports.length} structured report(s)`);
  }
  if (keyObjectSelections.length > 0) {
    console.log(`[DICOM] Found ${keyObjectSelections.length} key object selection(s)`);
  }
  if (presentationStates.length > 0) {
    console.log(`[DICOM] Found ${presentationStates.length} presentation state(s)`);
  }

  return {
    ...studyMetadata,
    series: sortedSeries,
    reports,
    keyObjectSelections,
    presentationStates,
  } as DicomStudy;
}

