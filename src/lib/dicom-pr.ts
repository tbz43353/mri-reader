import dicomParser from 'dicom-parser';
import type { PresentationState, GraphicAnnotation, SOPInstanceUID } from '../types';
import { createSOPUID } from '../types';

// Presentation State SOP Class UIDs
const PR_SOP_CLASSES = [
  '1.2.840.10008.5.1.4.1.1.11.1', // Grayscale Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.11.2', // Color Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.11.3', // Pseudo-Color Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.11.4', // Blending Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.11.5', // XA/XRF Grayscale Softcopy Presentation State
  '1.2.840.10008.5.1.4.1.1.11.6', // Grayscale Planar MPR Volumetric Presentation State
  '1.2.840.10008.5.1.4.1.1.11.7', // Compositing Planar MPR Volumetric Presentation State
  '1.2.840.10008.5.1.4.1.1.11.8', // Advanced Blending Presentation State
  '1.2.840.10008.5.1.4.1.1.11.9', // Volume Rendering Volumetric Presentation State
  '1.2.840.10008.5.1.4.1.1.11.10', // Segmented Volume Rendering Volumetric Presentation State
  '1.2.840.10008.5.1.4.1.1.11.11', // Multiple Volume Rendering Volumetric Presentation State
  '1.2.840.10008.5.1.4.1.1.11.12', // Variable Modality LUT Softcopy Presentation State
];

/**
 * Check if a DICOM file is a Presentation State based on SOP Class UID
 */
export function isPRFile(dataSet: dicomParser.DataSet): boolean {
  const sopClassUID = dataSet.string('x00080016');
  if (!sopClassUID) return false;
  return PR_SOP_CLASSES.includes(sopClassUID);
}

/**
 * Parse a Presentation State DICOM file
 */
export function parsePR(
  dataSet: dicomParser.DataSet,
  filePath: string
): PresentationState | null {
  const sopInstanceUID = dataSet.string('x00080018');

  if (!sopInstanceUID) {
    console.warn(`Missing SOP Instance UID in PR file: ${filePath}`);
    return null;
  }

  // Get referenced images
  const referencedImageUIDs = parseReferencedImages(dataSet);

  if (referencedImageUIDs.length === 0) {
    console.warn(`No referenced images in PR file: ${filePath}`);
    return null;
  }

  // Get window center/width from Softcopy VOI LUT Sequence (0028,3110)
  const { windowCenter, windowWidth } = parseVOILUT(dataSet);

  // Get presentation label
  const presentationLabel = dataSet.string('x00700080');

  // Get graphic annotations
  const graphicAnnotations = parseGraphicAnnotations(dataSet);

  return {
    sopInstanceUID: createSOPUID(sopInstanceUID),
    referencedImageUIDs,
    windowCenter,
    windowWidth,
    presentationLabel: presentationLabel ?? undefined,
    graphicAnnotations: graphicAnnotations.length > 0 ? graphicAnnotations : undefined,
  };
}

/**
 * Parse referenced image SOP Instance UIDs
 */
function parseReferencedImages(dataSet: dicomParser.DataSet): SOPInstanceUID[] {
  const imageUIDs: SOPInstanceUID[] = [];

  // Referenced Series Sequence (0008,1115)
  const refSeriesSeq = dataSet.elements['x00081115'];
  if (!refSeriesSeq?.items) return imageUIDs;

  for (const seriesItem of refSeriesSeq.items) {
    const seriesDS = seriesItem.dataSet;
    if (!seriesDS) continue;

    // Referenced Image Sequence (0008,1140)
    const refImageSeq = seriesDS.elements['x00081140'];
    if (!refImageSeq?.items) continue;

    for (const imageItem of refImageSeq.items) {
      const imageDS = imageItem.dataSet;
      if (!imageDS) continue;

      // Referenced SOP Instance UID (0008,1155)
      const refUID = imageDS.string('x00081155');
      if (refUID) {
        imageUIDs.push(createSOPUID(refUID));
      }
    }
  }

  return imageUIDs;
}

/**
 * Parse VOI LUT settings (window center/width)
 */
function parseVOILUT(
  dataSet: dicomParser.DataSet
): { windowCenter?: number; windowWidth?: number } {
  // Softcopy VOI LUT Sequence (0028,3110)
  const voiLutSeq = dataSet.elements['x00283110'];
  if (!voiLutSeq?.items?.[0]?.dataSet) {
    return {};
  }

  const voiDS = voiLutSeq.items[0].dataSet;

  // Window Center (0028,1050) and Window Width (0028,1051)
  const windowCenter = voiDS.floatString('x00281050');
  const windowWidth = voiDS.floatString('x00281051');

  return {
    windowCenter: windowCenter ?? undefined,
    windowWidth: windowWidth ?? undefined,
  };
}

/**
 * Parse Graphic Annotation Sequence (0070,0001)
 */
function parseGraphicAnnotations(dataSet: dicomParser.DataSet): GraphicAnnotation[] {
  const annotations: GraphicAnnotation[] = [];

  // Graphic Annotation Sequence (0070,0001)
  const graphicAnnotationSeq = dataSet.elements['x00700001'];
  if (!graphicAnnotationSeq?.items) return annotations;

  for (const annotationItem of graphicAnnotationSeq.items) {
    const annotationDS = annotationItem.dataSet;
    if (!annotationDS) continue;

    // Graphic Object Sequence (0070,0009)
    const graphicObjectSeq = annotationDS.elements['x00700009'];
    if (graphicObjectSeq?.items) {
      for (const objectItem of graphicObjectSeq.items) {
        const objectDS = objectItem.dataSet;
        if (!objectDS) continue;

        const annotation = parseGraphicObject(objectDS);
        if (annotation) {
          annotations.push(annotation);
        }
      }
    }

    // Text Object Sequence (0070,0008)
    const textObjectSeq = annotationDS.elements['x00700008'];
    if (textObjectSeq?.items) {
      for (const textItem of textObjectSeq.items) {
        const textDS = textItem.dataSet;
        if (!textDS) continue;

        const annotation = parseTextObject(textDS);
        if (annotation) {
          annotations.push(annotation);
        }
      }
    }
  }

  return annotations;
}

/**
 * Parse a single Graphic Object
 */
function parseGraphicObject(objectDS: dicomParser.DataSet): GraphicAnnotation | null {
  // Graphic Type (0070,0023) - POINT, POLYLINE, CIRCLE, ELLIPSE, INTERPOLATED
  const graphicType = objectDS.string('x00700023');
  if (!graphicType) return null;

  // Map DICOM type to our type
  let mappedType: GraphicAnnotation['graphicType'];
  switch (graphicType) {
    case 'POINT':
      mappedType = 'POINT';
      break;
    case 'POLYLINE':
    case 'INTERPOLATED':
      mappedType = 'POLYLINE';
      break;
    case 'CIRCLE':
      mappedType = 'CIRCLE';
      break;
    case 'ELLIPSE':
      mappedType = 'ELLIPSE';
      break;
    default:
      mappedType = 'POLYLINE';
  }

  // Graphic Data (0070,0022) - pairs of coordinates
  const graphicData = parseGraphicData(objectDS);
  if (!graphicData || graphicData.length === 0) return null;

  return {
    graphicType: mappedType,
    graphicData,
  };
}

/**
 * Parse a single Text Object
 */
function parseTextObject(textDS: dicomParser.DataSet): GraphicAnnotation | null {
  // Unformatted Text Value (0070,0006)
  const textValue = textDS.string('x00700006');
  if (!textValue) return null;

  // Bounding Box or Anchor Point
  const graphicData: number[] = [];

  // Try Anchor Point (0070,0014)
  const anchorPointStr = textDS.string('x00700014');
  if (anchorPointStr) {
    const parts = anchorPointStr.split('\\').map(Number);
    if (parts.length >= 2 && !parts.some(isNaN)) {
      graphicData.push(...parts);
    }
  }

  // If no anchor point, try Bounding Box Top Left Hand Corner (0070,0010)
  if (graphicData.length === 0) {
    const tlhcStr = textDS.string('x00700010');
    if (tlhcStr) {
      const parts = tlhcStr.split('\\').map(Number);
      if (parts.length >= 2 && !parts.some(isNaN)) {
        graphicData.push(...parts);
      }
    }
  }

  // Default position if none found
  if (graphicData.length === 0) {
    graphicData.push(0, 0);
  }

  return {
    graphicType: 'TEXT',
    graphicData,
    textValue,
  };
}

/**
 * Parse Graphic Data (0070,0022) - list of coordinate pairs
 * Graphic Data is stored as binary 32-bit floats (VR = FL)
 */
function parseGraphicData(objectDS: dicomParser.DataSet): number[] {
  // Graphic Data (0070,0022) - stored as binary floats (FL VR)
  const graphicDataElement = objectDS.elements['x00700022'];
  if (!graphicDataElement) return [];

  // Number of Graphic Points (0070,0021)
  const numPoints = objectDS.uint16('x00700021') ?? 0;
  if (numPoints === 0) return [];

  // Each point has 2 coordinates (x, y), each float is 4 bytes
  const expectedBytes = numPoints * 2 * 4;
  if (graphicDataElement.length < expectedBytes) {
    // Graphic data length mismatch - continue with available data
  }

  // Read binary float data
  const coords: number[] = [];
  const numFloats = numPoints * 2; // x,y pairs

  for (let i = 0; i < numFloats; i++) {
    const floatValue = objectDS.float('x00700022', i);
    if (floatValue !== undefined) {
      coords.push(floatValue);
    }
  }

  return coords;
}
