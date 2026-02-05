import dicomParser from 'dicom-parser';
import type { DicomReport, ReportFinding } from '../types';
import { createSeriesUID, createSOPUID } from '../types';
import { formatDicomDate } from './dicom-utils';

// SR SOP Class UIDs
const SR_SOP_CLASSES = [
  '1.2.840.10008.5.1.4.1.1.88.11', // Basic Text SR
  '1.2.840.10008.5.1.4.1.1.88.22', // Enhanced SR
  '1.2.840.10008.5.1.4.1.1.88.33', // Comprehensive SR
  '1.2.840.10008.5.1.4.1.1.88.34', // Comprehensive 3D SR
  '1.2.840.10008.5.1.4.1.1.88.35', // Extensible SR
  '1.2.840.10008.5.1.4.1.1.88.40', // Procedure Log
  '1.2.840.10008.5.1.4.1.1.88.50', // Mammography CAD SR
  '1.2.840.10008.5.1.4.1.1.88.65', // Chest CAD SR
  '1.2.840.10008.5.1.4.1.1.88.67', // X-Ray Radiation Dose SR
  '1.2.840.10008.5.1.4.1.1.88.68', // Radiopharmaceutical Radiation Dose SR
  '1.2.840.10008.5.1.4.1.1.88.69', // Colon CAD SR
  '1.2.840.10008.5.1.4.1.1.88.70', // Implantation Plan SR
  '1.2.840.10008.5.1.4.1.1.88.71', // Acquisition Context SR
  '1.2.840.10008.5.1.4.1.1.88.72', // Simplified Adult Echo SR
  '1.2.840.10008.5.1.4.1.1.88.73', // Patient Radiation Dose SR
  '1.2.840.10008.5.1.4.1.1.88.74', // Planned Imaging Agent Administration SR
  '1.2.840.10008.5.1.4.1.1.88.75', // Performed Imaging Agent Administration SR
  '1.2.840.10008.5.1.4.1.1.88.76', // Enhanced X-Ray Radiation Dose SR
];

/**
 * Check if a DICOM file is a Structured Report based on SOP Class UID
 */
export function isSRFile(dataSet: dicomParser.DataSet): boolean {
  const sopClassUID = dataSet.string('x00080016');
  if (!sopClassUID) return false;
  return SR_SOP_CLASSES.includes(sopClassUID);
}

/**
 * Parse a Structured Report DICOM file
 */
export function parseSR(
  dataSet: dicomParser.DataSet,
  filePath: string
): DicomReport | null {
  const sopInstanceUID = dataSet.string('x00080018');
  const seriesInstanceUID = dataSet.string('x0020000e');

  if (!sopInstanceUID || !seriesInstanceUID) {
    console.warn(`Missing UIDs in SR file: ${filePath}`);
    return null;
  }

  // Get completion and verification flags
  const completionFlag = dataSet.string('x0040a491') as 'PARTIAL' | 'COMPLETE' | undefined;
  const verificationFlag = dataSet.string('x0040a493') as 'UNVERIFIED' | 'VERIFIED' | undefined;

  // Get content date
  const contentDate = dataSet.string('x00080023');

  // Parse the Content Sequence (0040,A730)
  const findings = parseContentSequence(dataSet);

  return {
    sopInstanceUID: createSOPUID(sopInstanceUID),
    seriesInstanceUID: createSeriesUID(seriesInstanceUID),
    contentDate: contentDate ? formatDicomDate(contentDate) : undefined,
    completionFlag: completionFlag ?? 'COMPLETE',
    verificationFlag: verificationFlag ?? 'UNVERIFIED',
    findings,
  };
}

/**
 * Parse the Content Sequence recursively
 * Content Sequence (0040,A730) contains the actual report data
 */
function parseContentSequence(dataSet: dicomParser.DataSet): ReportFinding[] {
  const findings: ReportFinding[] = [];

  // Content Sequence tag
  const contentSequence = dataSet.elements['x0040a730'];
  if (!contentSequence || !contentSequence.items) {
    return findings;
  }

  for (const item of contentSequence.items) {
    const finding = parseContentItem(item.dataSet);
    if (finding) {
      findings.push(finding);
    }
  }

  return findings;
}

/**
 * Parse a single content item from the Content Sequence
 */
function parseContentItem(itemDataSet: dicomParser.DataSet | undefined): ReportFinding | null {
  if (!itemDataSet) return null;

  // Value Type (0040,A040) - TEXT, NUM, CODE, CONTAINER, IMAGE, etc.
  const valueType = itemDataSet.string('x0040a040') as ReportFinding['valueType'] | undefined;
  if (!valueType) return null;

  // Concept Name Code Sequence (0040,A043) - what this finding is about
  const conceptName = getConceptName(itemDataSet);

  // Get the value based on type
  let value = '';
  let unit: string | undefined;
  let referencedImageUID: string | undefined;

  switch (valueType) {
    case 'TEXT':
      // Text Value (0040,A160)
      value = itemDataSet.string('x0040a160') ?? '';
      break;

    case 'NUM':
      // Measured Value Sequence (0040,A300)
      const measuredValueSeq = itemDataSet.elements['x0040a300'];
      if (measuredValueSeq?.items?.[0]?.dataSet) {
        const mvDataSet = measuredValueSeq.items[0].dataSet;
        // Numeric Value (0040,A30A)
        const numericValue = mvDataSet.floatString('x0040a30a');
        value = numericValue?.toString() ?? '';

        // Measurement Units Code Sequence (0040,08EA)
        const unitsSeq = mvDataSet.elements['x004008ea'];
        if (unitsSeq?.items?.[0]?.dataSet) {
          unit = unitsSeq.items[0].dataSet.string('x00080104'); // Code Meaning
        }
      }
      break;

    case 'CODE':
      // Concept Code Sequence (0040,A168)
      const codeSeq = itemDataSet.elements['x0040a168'];
      if (codeSeq?.items?.[0]?.dataSet) {
        value = codeSeq.items[0].dataSet.string('x00080104') ?? ''; // Code Meaning
      }
      break;

    case 'IMAGE':
      // Referenced SOP Sequence (0008,1199)
      const refSopSeq = itemDataSet.elements['x00081199'];
      if (refSopSeq?.items?.[0]?.dataSet) {
        referencedImageUID = refSopSeq.items[0].dataSet.string('x00081155'); // Referenced SOP Instance UID
        value = conceptName || 'Image Reference';
      }
      break;

    case 'CONTAINER':
      // Container - has child content items
      value = conceptName || 'Container';
      break;

    default:
      // Unknown type, try to get any text
      value = conceptName || valueType;
  }

  // Parse child content items (for CONTAINERs and other nested structures)
  const contentSequence = itemDataSet.elements['x0040a730'];
  let children: ReportFinding[] | undefined;
  if (contentSequence?.items) {
    children = [];
    for (const childItem of contentSequence.items) {
      const childFinding = parseContentItem(childItem.dataSet);
      if (childFinding) {
        children.push(childFinding);
      }
    }
    if (children.length === 0) {
      children = undefined;
    }
  }

  return {
    conceptName: conceptName || 'Finding',
    value,
    valueType,
    unit,
    children,
    referencedImageUID,
  };
}

/**
 * Extract concept name from Concept Name Code Sequence
 */
function getConceptName(dataSet: dicomParser.DataSet): string {
  // Concept Name Code Sequence (0040,A043)
  const conceptNameSeq = dataSet.elements['x0040a043'];
  if (!conceptNameSeq?.items?.[0]?.dataSet) {
    return '';
  }

  const cnDataSet = conceptNameSeq.items[0].dataSet;
  // Code Meaning (0008,0104) - human-readable name
  return cnDataSet.string('x00080104') ?? '';
}

