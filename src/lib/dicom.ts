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

// Result type for parsing a single DICOM file
type ParseResult =
  | { type: 'image'; data: DicomImage }
  | { type: 'report'; data: DicomReport }
  | { type: 'keyObject'; data: KeyObjectSelection }
  | { type: 'presentationState'; data: PresentationState }
  | null;

// Parse a single DICOM file and extract metadata
async function parseDicomFile(filePath: string): Promise<ParseResult> {
  try {
    const buffer = await window.electronAPI.readFile(filePath);

    // Security: Check file size
    if (buffer.byteLength > DICOM_SECURITY.maxFileSize) {
      console.warn(`File too large, skipping: ${filePath}`);
      return null;
    }

    const byteArray = new Uint8Array(buffer);

    // Parse DICOM
    const dataSet = dicomParser.parseDicom(byteArray);

    // Check for non-image DICOM types FIRST (before pixel data check)
    // Structured Report
    if (isSRFile(dataSet)) {
      const report = parseSR(dataSet, filePath);
      return report ? { type: 'report', data: report } : null;
    }

    // Key Object Selection
    if (isKOFile(dataSet)) {
      const ko = parseKO(dataSet, filePath);
      return ko ? { type: 'keyObject', data: ko } : null;
    }

    // Presentation State
    if (isPRFile(dataSet)) {
      const pr = parsePR(dataSet, filePath);
      return pr ? { type: 'presentationState', data: pr } : null;
    }

    // Check for pixel data - skip other non-image files
    const pixelDataElement = dataSet.elements['x7fe00010'];
    if (!pixelDataElement) {
      // Unknown non-image file type
      return null;
    }

    // Extract required fields for images
    const sopInstanceUID = dataSet.string('x00080018');
    const seriesInstanceUID = dataSet.string('x0020000e');
    const instanceNumber = dataSet.intString('x00200013') ?? 0;
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

    // Parse graphic overlays (embedded in images)
    const overlays = parseOverlays(dataSet);

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
        overlays: overlays.length > 0 ? overlays : undefined,
      },
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

// Parse study-level metadata from the first valid DICOM file
async function parseStudyMetadata(filePath: string): Promise<Partial<DicomStudy> | null> {
  try {
    const buffer = await window.electronAPI.readFile(filePath);
    const byteArray = new Uint8Array(buffer);
    const dataSet = dicomParser.parseDicom(byteArray);

    const studyInstanceUID = dataSet.string('x0020000d');
    if (!studyInstanceUID) return null;

    return {
      studyInstanceUID: createStudyUID(studyInstanceUID),
      patientName: (dataSet.string('x00100010') ?? 'Unknown').replace(/\^/g, ' ').trim(),
      patientId: dataSet.string('x00100020') ?? '',
      studyDate: formatDicomDate(dataSet.string('x00080020')),
      studyDescription: dataSet.string('x00081030') ?? '',
      modality: dataSet.string('x00080060') ?? '',
      institutionName: dataSet.string('x00080080') ?? undefined,
      referringPhysician: dataSet.string('x00080090') ?? undefined,
    };
  } catch {
    return null;
  }
}

// Parse series-level metadata
async function parseSeriesMetadata(filePath: string): Promise<Partial<DicomSeries> | null> {
  try {
    const buffer = await window.electronAPI.readFile(filePath);
    const byteArray = new Uint8Array(buffer);
    const dataSet = dicomParser.parseDicom(byteArray);

    const seriesInstanceUID = dataSet.string('x0020000e');
    const studyInstanceUID = dataSet.string('x0020000d');
    if (!seriesInstanceUID || !studyInstanceUID) return null;

    return {
      seriesInstanceUID: createSeriesUID(seriesInstanceUID),
      studyInstanceUID: createStudyUID(studyInstanceUID),
      seriesNumber: dataSet.intString('x00200011') ?? 0,
      seriesDescription: dataSet.string('x0008103e') ?? '',
      bodyPart: dataSet.string('x00180015') ?? undefined,
      modality: dataSet.string('x00080060') ?? '',
    };
  } catch {
    return null;
  }
}

// Load DICOM study from a list of file paths
export async function loadDicomFromFolder(
  filePaths: string[],
  onProgress: (progress: LoadingProgress) => void
): Promise<DicomStudy | null> {
  if (filePaths.length === 0) {
    return null;
  }

  // Parse study metadata from first file
  onProgress({ phase: 'parsing', current: 0, total: filePaths.length, message: 'Reading study information...' });

  let studyMetadata: Partial<DicomStudy> | null = null;
  for (const filePath of filePaths.slice(0, 10)) {
    studyMetadata = await parseStudyMetadata(filePath);
    if (studyMetadata) break;
  }

  if (!studyMetadata) {
    return null;
  }

  // Parse all DICOM files
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

    // Handle different DICOM object types
    switch (result.type) {
      case 'image': {
        const image = result.data;
        images.push(image);

        // Create or update series
        if (!seriesMap.has(image.seriesInstanceUID)) {
          const seriesMeta = await parseSeriesMetadata(filePath);
          if (seriesMeta) {
            seriesMap.set(image.seriesInstanceUID, {
              ...seriesMeta,
              images: [],
            } as DicomSeries);
          }
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

