/**
 * DICOM Patient Orientation calculation
 * Computes anatomical directional letters (R, L, A, P, S, I) for canvas borders:
 * Left, Right, Top, Bottom.
 */

export interface ViewportOrientationLabels {
  left: string;
  right: string;
  top: string;
  bottom: string;
}

/**
 * Convert a 3D direction vector into anatomical letter(s).
 * In DICOM LPS system:
 * +X = Left (L), -X = Right (R)
 * +Y = Posterior (P), -Y = Anterior (A)
 * +Z = Superior (S), -Z = Inferior (I)
 */
export function getOrientationStringFromVector(vector: [number, number, number]): string {
  const [x, y, z] = vector;
  const absX = Math.abs(x);
  const absY = Math.abs(y);
  const absZ = Math.abs(z);

  // Collect dominant components above threshold
  const components: { char: string; weight: number }[] = [];

  if (absX > 0.15) {
    components.push({ char: x > 0 ? 'L' : 'R', weight: absX });
  }
  if (absY > 0.15) {
    components.push({ char: y > 0 ? 'P' : 'A', weight: absY });
  }
  if (absZ > 0.15) {
    components.push({ char: z > 0 ? 'S' : 'I', weight: absZ });
  }

  // Sort by weight descending
  components.sort((a, b) => b.weight - a.weight);

  return components.map((c) => c.char).join('') || '';
}

/**
 * Calculate anatomical orientation letters for the 4 borders of a viewport canvas.
 *
 * @param iop ImageOrientationPatient array of 6 floats: [Rx, Ry, Rz, Cx, Cy, Cz]
 */
export function getAnatomicalOrientation(
  iop?: [number, number, number, number, number, number]
): ViewportOrientationLabels | null {
  if (!iop || iop.length !== 6) {
    return null;
  }

  const rowCosine: [number, number, number] = [iop[0], iop[1], iop[2]];
  const colCosine: [number, number, number] = [iop[3], iop[4], iop[5]];

  const negRowCosine: [number, number, number] = [-iop[0], -iop[1], -iop[2]];
  const negColCosine: [number, number, number] = [-iop[3], -iop[4], -iop[5]];

  const right = getOrientationStringFromVector(rowCosine);
  const left = getOrientationStringFromVector(negRowCosine);
  const bottom = getOrientationStringFromVector(colCosine);
  const top = getOrientationStringFromVector(negColCosine);

  return { left, right, top, bottom };
}

/**
 * Determine standard view plane category: Axial, Sagittal, Coronal, or Oblique.
 */
export function getViewPlaneType(
  iop?: [number, number, number, number, number, number]
): 'Axial' | 'Sagittal' | 'Coronal' | 'Oblique' {
  if (!iop || iop.length !== 6) return 'Axial';

  // Normal vector = row x col
  const nx = iop[1] * iop[5] - iop[2] * iop[4];
  const ny = iop[2] * iop[3] - iop[0] * iop[5];
  const nz = iop[0] * iop[4] - iop[1] * iop[3];

  const absZ = Math.abs(nz);
  const absY = Math.abs(ny);
  const absX = Math.abs(nx);

  if (absZ > 0.8) return 'Axial';
  if (absX > 0.8) return 'Sagittal';
  if (absY > 0.8) return 'Coronal';
  return 'Oblique';
}
