import dicomParser from 'dicom-parser';
import type { KeyObjectSelection, SOPInstanceUID } from '../types';
import { createSOPUID } from '../types';

// Key Object Selection SOP Class UID
const KO_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.88.59';

/**
 * Check if a DICOM file is a Key Object Selection based on SOP Class UID
 */
export function isKOFile(dataSet: dicomParser.DataSet): boolean {
  const sopClassUID = dataSet.string('x00080016');
  return sopClassUID === KO_SOP_CLASS;
}

/**
 * Parse a Key Object Selection DICOM file
 */
export function parseKO(
  dataSet: dicomParser.DataSet,
  filePath: string
): KeyObjectSelection | null {
  const sopInstanceUID = dataSet.string('x00080018');

  if (!sopInstanceUID) {
    console.warn(`Missing SOP Instance UID in KO file: ${filePath}`);
    return null;
  }

  // Get title from Concept Name Code Sequence (0040,A043) in the root
  const title = getKOTitle(dataSet);

  // Get description from Content Sequence if available
  const description = getKODescription(dataSet);

  // Parse referenced images from Content Sequence
  const keyImages = parseReferencedImages(dataSet);

  if (keyImages.length === 0) {
    console.warn(`No key images found in KO file: ${filePath}`);
    return null;
  }

  return {
    sopInstanceUID: createSOPUID(sopInstanceUID),
    title: title || 'Key Images',
    description,
    keyImages,
  };
}

/**
 * Get KO title from Concept Name Code Sequence
 */
function getKOTitle(dataSet: dicomParser.DataSet): string {
  // Concept Name Code Sequence (0040,A043)
  const conceptNameSeq = dataSet.elements['x0040a043'];
  if (conceptNameSeq?.items?.[0]?.dataSet) {
    const cnDataSet = conceptNameSeq.items[0].dataSet;
    return cnDataSet.string('x00080104') ?? ''; // Code Meaning
  }
  return '';
}

/**
 * Get optional description from Content Sequence
 */
function getKODescription(dataSet: dicomParser.DataSet): string | undefined {
  // Content Sequence (0040,A730)
  const contentSeq = dataSet.elements['x0040a730'];
  if (!contentSeq?.items) return undefined;

  for (const item of contentSeq.items) {
    const itemDS = item.dataSet;
    if (!itemDS) continue;

    // Look for TEXT value type with description
    const valueType = itemDS.string('x0040a040');
    if (valueType === 'TEXT') {
      const textValue = itemDS.string('x0040a160');
      if (textValue) return textValue;
    }
  }

  return undefined;
}

/**
 * Parse referenced image SOP Instance UIDs from Content Sequence
 */
function parseReferencedImages(dataSet: dicomParser.DataSet): SOPInstanceUID[] {
  const keyImages: SOPInstanceUID[] = [];

  // Content Sequence (0040,A730)
  const contentSeq = dataSet.elements['x0040a730'];
  if (!contentSeq?.items) return keyImages;

  for (const item of contentSeq.items) {
    const itemDS = item.dataSet;
    if (!itemDS) continue;

    // Look for IMAGE value type
    const valueType = itemDS.string('x0040a040');
    if (valueType === 'IMAGE') {
      // Referenced SOP Sequence (0008,1199)
      const refSopSeq = itemDS.elements['x00081199'];
      if (refSopSeq?.items?.[0]?.dataSet) {
        const refUID = refSopSeq.items[0].dataSet.string('x00081155'); // Referenced SOP Instance UID
        if (refUID) {
          keyImages.push(createSOPUID(refUID));
        }
      }
    }

    // Also check for nested content sequences
    const nestedContentSeq = itemDS.elements['x0040a730'];
    if (nestedContentSeq?.items) {
      for (const nestedItem of nestedContentSeq.items) {
        const nestedDS = nestedItem.dataSet;
        if (!nestedDS) continue;

        const nestedValueType = nestedDS.string('x0040a040');
        if (nestedValueType === 'IMAGE') {
          const refSopSeq = nestedDS.elements['x00081199'];
          if (refSopSeq?.items?.[0]?.dataSet) {
            const refUID = refSopSeq.items[0].dataSet.string('x00081155');
            if (refUID) {
              keyImages.push(createSOPUID(refUID));
            }
          }
        }
      }
    }
  }

  return keyImages;
}
