// Plain language terminology mapping for non-expert users
import type { ViewingPreset } from '../types';

const PLAIN_LANGUAGE: Record<string, string> = {
  // Medical terms -> Plain language
  'Window/Level': 'Brightness/Contrast',
  'Axial': 'Top-down view',
  'Sagittal': 'Side view',
  'Coronal': 'Front view',
  'Series': 'scan sequence',
  'series': 'scan sequences',
  'Instance': 'Image',
  'Modality': 'Scan type',
  'DICOM': 'Medical image file',

  // Modalities - imaging
  'MR': 'MRI',
  'CT': 'CT Scan',
  'US': 'Ultrasound',
  'XR': 'X-ray',
  'CR': 'X-ray',
  'DX': 'X-ray',
  'MG': 'Mammogram',
  'PT': 'PET Scan',
  'NM': 'Nuclear Medicine',
  'RF': 'Fluoroscopy',
  'XA': 'Angiography',
  'OT': 'Other',

  // Modalities - derived/secondary
  'PR': 'Key Images',
  'SC': 'Key Images',
  'SR': 'Report',
  'KO': 'Key Images',
  'SEG': 'Segmentation',
  'REG': 'Registration',
  'DOC': 'Document',

  // Radiation therapy
  'RTIMAGE': 'Radiation Image',
  'RTDOSE': 'Radiation Dose',
  'RTSTRUCT': 'Radiation Structure',
  'RTPLAN': 'Radiation Plan',
};

export function toPlainLanguage(term: string | undefined, expertMode: boolean): string {
  if (!term) return '';
  if (expertMode) return term;
  return PLAIN_LANGUAGE[term] ?? term;
}

// Body region labels
const BODY_REGION_LABELS: Record<string, string> = {
  'HEAD': 'Head & Brain',
  'BRAIN': 'Brain',
  'NECK': 'Neck',
  'CSPINE': 'Neck/Cervical Spine',
  'C SPINE': 'Neck/Cervical Spine',
  'TSPINE': 'Upper Back',
  'T SPINE': 'Upper Back',
  'LSPINE': 'Lower Back',
  'L SPINE': 'Lower Back',
  'SPINE': 'Spine',
  'CHEST': 'Chest',
  'THORAX': 'Chest',
  'ABDOMEN': 'Abdomen',
  'PELVIS': 'Pelvis/Hips',
  'KNEE': 'Knee',
  'ANKLE': 'Ankle',
  'FOOT': 'Foot',
  'SHOULDER': 'Shoulder',
  'ELBOW': 'Elbow',
  'WRIST': 'Wrist',
  'HAND': 'Hand',
  'WHOLEBODY': 'Whole Body',
  'WHOLE BODY': 'Whole Body',
  'WB': 'Whole Body',
  'PROSTATE': 'Prostate',
  'BREAST': 'Breast',
  'HEART': 'Heart',
  'CARDIAC': 'Heart',
  'LIVER': 'Liver',
  'KIDNEY': 'Kidney',
  'HIP': 'Hip',
  'THIGH': 'Thigh',
  'LEG': 'Leg',
  'ARM': 'Arm',
  'FOREARM': 'Forearm',
};

export function getBodyRegionLabel(bodyPart: string | undefined): string {
  if (!bodyPart) return '';
  const upper = bodyPart.toUpperCase().trim();
  return BODY_REGION_LABELS[upper] ?? bodyPart;
}

// Viewing presets for non-expert users (ViewingPreset interface imported from types.ts)
export const VIEWING_PRESETS: ViewingPreset[] = [
  {
    id: 'auto',
    name: 'Automatic',
    description: 'Let the app choose the best settings',
    windowCenter: 0,
    windowWidth: 0,
    applicableModalities: ['MR', 'CT', 'US', 'XR', 'CR', 'DX'],
  },
  {
    id: 'soft-tissue',
    name: 'Soft Tissue',
    description: 'Best for viewing organs and muscles',
    windowCenter: 40,
    windowWidth: 400,
    applicableModalities: ['CT'],
  },
  {
    id: 'bone',
    name: 'Bone',
    description: 'Best for viewing bones',
    windowCenter: 400,
    windowWidth: 1500,
    applicableModalities: ['CT'],
  },
  {
    id: 'brain',
    name: 'Brain',
    description: 'Optimized for brain scans',
    windowCenter: 50,
    windowWidth: 100,
    applicableModalities: ['MR', 'CT'],
  },
  {
    id: 'lung',
    name: 'Lung',
    description: 'Best for viewing lungs',
    windowCenter: -600,
    windowWidth: 1500,
    applicableModalities: ['CT'],
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    description: 'Makes differences more visible',
    windowCenter: 0,
    windowWidth: 50,
    applicableModalities: ['MR'],
  },
];

export function getPresetsForModality(modality: string): ViewingPreset[] {
  return VIEWING_PRESETS.filter(
    preset => preset.id === 'auto' || preset.applicableModalities.includes(modality)
  );
}

// MRI sequence simplifications for non-expert users
const SEQUENCE_SIMPLIFICATIONS: Record<string, string> = {
  'FLAIR': 'Fluid Suppressed',
  'STIR': 'Fat Suppressed',
  'DWI': 'Diffusion',
  'ADC': 'Diffusion Map',
  'TOF': 'Blood Vessels',
  'DIXON': 'Fat/Water',
  'SWI': 'Iron Detection',
  'MRA': 'Blood Vessels',
  'MRV': 'Vein Imaging',
  'CISS': 'Fluid Enhanced',
  'FIESTA': 'Fluid Enhanced',
  'MPRAGE': 'High Detail',
  'VIBE': 'Contrast Enhanced',
  'HASTE': 'Fast Scan',
  'TSE': 'Standard',
  'FSE': 'Standard',
  'GRE': 'Gradient',
  'EPI': 'Fast',
  'COW': 'Brain Vessels',
  'MPR': '3D View',
  'MIP': 'Projection',
  'SPACE': 'High Resolution',
  'TIRM': 'Fat Suppressed',
  'BLADE': 'Motion Corrected',
  'PROPELLER': 'Motion Corrected',
};

// Orientation abbreviation expansions
const ORIENTATION_MAP: Record<string, string> = {
  'COR': 'Coronal',
  'SAG': 'Sagittal',
  'AX': 'Axial',
  'TRA': 'Axial',
  'AXI': 'Axial',
};

/**
 * Simplifies technical MRI series descriptions for non-expert users.
 * Expands abbreviations, simplifies sequence names, and cleans up formatting.
 */
export function simplifySeriesDescription(
  description: string | undefined,
  expertMode: boolean
): string {
  if (!description) return 'Scan';
  if (expertMode) return description;

  let result = description
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Expand orientations (case-insensitive word boundaries)
  for (const [abbr, full] of Object.entries(ORIENTATION_MAP)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    result = result.replace(regex, full);
  }

  // Simplify sequences (case-insensitive word boundaries)
  for (const [abbr, simple] of Object.entries(SEQUENCE_SIMPLIFICATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    result = result.replace(regex, simple);
  }

  // Clean up common DIXON suffixes
  result = result
    .replace(/\bW\b(?=\s|$)/gi, 'Water')
    .replace(/\bF\b(?=\s|$)/gi, 'Fat')
    .replace(/\bIN\b(?=\s|$)/gi, 'In-Phase')
    .replace(/\bOPP\b(?=\s|$)/gi, 'Out-Phase');

  // Clean up contrast indicators
  result = result
    .replace(/\s*\+\s*C\b/gi, ' (Contrast)')
    .replace(/\bPRE\b/gi, 'Pre-Contrast')
    .replace(/\bPOST\b/gi, 'Post-Contrast');

  // Title case each word
  result = result
    .split(' ')
    .map((word) => {
      if (word.length === 0) return word;
      // Keep T1, T2, 3D as-is
      if (/^(T1|T2|3D|2D)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  // Truncate if very long
  if (result.length > 40) {
    result = result.substring(0, 37) + '...';
  }

  return result || 'Scan';
}
