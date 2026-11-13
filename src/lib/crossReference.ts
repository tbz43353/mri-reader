import { type Types } from '@cornerstonejs/core';
import type { DicomImage, DicomSeries } from '../types';

export interface LocalizerLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CrossReferenceResult {
  activeLine: (LocalizerLine & { sliceIndex: number; totalSlices: number }) | null;
  slabStartLine: LocalizerLine | null;
  slabEndLine: LocalizerLine | null;
  slabPolygonPoints: string | null;
  hasIntersection: boolean;
  isParallel: boolean;
  sourceSeriesDescription: string;
}

interface Plane3D {
  normal: [number, number, number]; // Unit normal
  origin: [number, number, number]; // Point on plane
  d: number; // Normal . Origin
}

/**
 * Clips a line segment (or extended line) to a 2D bounding box using Liang-Barsky algorithm.
 */
export function clipLineToRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: { xMin: number; xMax: number; yMin: number; yMax: number }
): LocalizerLine | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;

  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.xMin, rect.xMax - x1, y1 - rect.yMin, rect.yMax - y1];

  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-8) {
      if (q[i] < 0) return null; // Parallel and outside
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }

  if (t0 >= t1) return null;

  return {
    x1: Math.round(x1 + t0 * dx),
    y1: Math.round(y1 + t0 * dy),
    x2: Math.round(x2 + t1 * dx),
    y2: Math.round(y2 + t1 * dy),
  };
}

/**
 * Vector cross product in 3D.
 */
function cross3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Vector dot product in 3D.
 */
function dot3(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Normalize vector to unit length.
 */
function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-8) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Extract 3D plane definition for a DICOM slice.
 */
function getSlicePlane(
  slice: DicomImage,
  fallbackOrigin?: [number, number, number],
  fallbackNormal?: [number, number, number]
): Plane3D | null {
  let normal: [number, number, number] | null = null;
  let origin: [number, number, number] | null = null;

  // 1. Try ImageOrientationPatient (0020,0037)
  if (slice.imageOrientationPatient && slice.imageOrientationPatient.length === 6) {
    const iop = slice.imageOrientationPatient;
    const rowCos: [number, number, number] = [iop[0], iop[1], iop[2]];
    const colCos: [number, number, number] = [iop[3], iop[4], iop[5]];
    normal = normalize3(cross3(rowCos, colCos));
  } else if (fallbackNormal) {
    normal = normalize3(fallbackNormal);
  }

  // 2. Try ImagePositionPatient (0020,0032)
  if (slice.imagePositionPatient && slice.imagePositionPatient.length === 3) {
    origin = [...slice.imagePositionPatient];
  } else if (fallbackOrigin) {
    origin = [...fallbackOrigin];
  }

  if (!normal || !origin) return null;

  const d = dot3(normal, origin);
  return { normal, origin, d };
}

/**
 * Intersect source slice plane with target viewport plane and return canvas-clipped line.
 */
function intersectPlaneWithTargetViewport(
  sourcePlane: Plane3D,
  targetPlane: Plane3D,
  targetViewport: Types.IStackViewport,
  clipBounds: { xMin: number; xMax: number; yMin: number; yMax: number }
): LocalizerLine | null {
  const nA = sourcePlane.normal;
  const nT = targetPlane.normal;

  const cosTheta = dot3(nA, nT);
  // Check if planes are parallel
  if (Math.abs(cosTheta) > 0.995) {
    return null;
  }

  const denom = 1 - cosTheta * cosTheta;
  if (denom < 1e-6) {
    return null;
  }

  // Direction of intersection line
  const u = normalize3(cross3(nA, nT));

  // Point on intersection line closest to origin
  const cA = (sourcePlane.d - targetPlane.d * cosTheta) / denom;
  const cT = (targetPlane.d - sourcePlane.d * cosTheta) / denom;
  const p0: [number, number, number] = [
    cA * nA[0] + cT * nT[0],
    cA * nA[1] + cT * nT[1],
    cA * nA[2] + cT * nT[2],
  ];

  // Two 3D points extended along the line
  const span = 4000; // 4 meters in world space
  const w1: Types.Point3 = [
    p0[0] - span * u[0],
    p0[1] - span * u[1],
    p0[2] - span * u[2],
  ];
  const w2: Types.Point3 = [
    p0[0] + span * u[0],
    p0[1] + span * u[1],
    p0[2] + span * u[2],
  ];

  // Project to target viewport canvas
  const c1 = targetViewport.worldToCanvas(w1);
  const c2 = targetViewport.worldToCanvas(w2);

  if (!c1 || !c2 || Number.isNaN(c1[0]) || Number.isNaN(c2[0])) {
    return null;
  }

  // Clip to canvas bounds
  return clipLineToRect(c1[0], c1[1], c2[0], c2[1], clipBounds);
}

/**
 * Compute bidirectional cross-referencing lines and slab extent between two viewports.
 *
 * @param sourceSeries Series displayed in the source/focused viewport
 * @param sourceSliceIndex Active slice index in the source series
 * @param targetViewport The target Cornerstone StackViewport on which lines will be rendered
 * @param canvasWidth Width of target viewport canvas
 * @param canvasHeight Height of target viewport canvas
 */
export function computeCrossReference(
  sourceSeries: DicomSeries,
  sourceSliceIndex: number,
  targetViewport: Types.IStackViewport | null | undefined,
  canvasWidth: number,
  canvasHeight: number
): CrossReferenceResult | null {
  if (!targetViewport || !sourceSeries || sourceSeries.images.length === 0) {
    return null;
  }

  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return null;
  }

  // Get target viewport camera and plane
  const camera = targetViewport.getCamera();
  if (!camera || !camera.viewPlaneNormal || !camera.focalPoint) {
    return null;
  }

  const targetNormal = normalize3([
    camera.viewPlaneNormal[0],
    camera.viewPlaneNormal[1],
    camera.viewPlaneNormal[2],
  ]);
  const targetFocalPoint: [number, number, number] = [
    camera.focalPoint[0],
    camera.focalPoint[1],
    camera.focalPoint[2],
  ];
  const targetPlane: Plane3D = {
    normal: targetNormal,
    origin: targetFocalPoint,
    d: dot3(targetNormal, targetFocalPoint),
  };

  const clipBounds = {
    xMin: 6,
    xMax: canvasWidth - 6,
    yMin: 6,
    yMax: canvasHeight - 6,
  };

  // Get active source slice
  const clampedSliceIndex = Math.max(0, Math.min(sourceSliceIndex, sourceSeries.images.length - 1));
  const activeSlice = sourceSeries.images[clampedSliceIndex];
  if (!activeSlice) return null;

  // Determine fallback normal / origin if individual slices lack DICOM tags
  let fallbackNormal: [number, number, number] | undefined;
  let fallbackOrigin: [number, number, number] | undefined;

  for (const img of sourceSeries.images) {
    if (img.imageOrientationPatient) {
      const iop = img.imageOrientationPatient;
      fallbackNormal = normalize3(cross3([iop[0], iop[1], iop[2]], [iop[3], iop[4], iop[5]]));
      break;
    }
  }

  for (const img of sourceSeries.images) {
    if (img.imagePositionPatient) {
      fallbackOrigin = [...img.imagePositionPatient];
      break;
    }
  }

  const activePlane = getSlicePlane(activeSlice, fallbackOrigin, fallbackNormal);
  if (!activePlane) {
    return null;
  }

  // Check if source and target are parallel
  const cosAngle = Math.abs(dot3(activePlane.normal, targetPlane.normal));
  if (cosAngle > 0.99) {
    return {
      activeLine: null,
      slabStartLine: null,
      slabEndLine: null,
      slabPolygonPoints: null,
      hasIntersection: false,
      isParallel: true,
      sourceSeriesDescription: sourceSeries.seriesDescription || 'Series',
    };
  }

  // 1. Calculate active slice line
  const activeLineRaw = intersectPlaneWithTargetViewport(
    activePlane,
    targetPlane,
    targetViewport,
    clipBounds
  );

  const activeLine = activeLineRaw
    ? {
        ...activeLineRaw,
        sliceIndex: clampedSliceIndex,
        totalSlices: sourceSeries.images.length,
      }
    : null;

  // 2. Calculate series slab extent (first and last slice)
  const firstSlice = sourceSeries.images[0];
  const lastSlice = sourceSeries.images[sourceSeries.images.length - 1];

  let firstPlane = getSlicePlane(firstSlice, fallbackOrigin, fallbackNormal);
  let lastPlane = getSlicePlane(lastSlice, fallbackOrigin, fallbackNormal);

  // If first or last slice origin wasn't explicitly saved, offset along normal
  if (fallbackNormal && activeSlice.imagePositionPatient) {
    if (!firstSlice.imagePositionPatient) {
      const offset = (0 - clampedSliceIndex) * (activeSlice.sliceThickness || 4);
      const origin: [number, number, number] = [
        activeSlice.imagePositionPatient[0] + fallbackNormal[0] * offset,
        activeSlice.imagePositionPatient[1] + fallbackNormal[1] * offset,
        activeSlice.imagePositionPatient[2] + fallbackNormal[2] * offset,
      ];
      firstPlane = { normal: fallbackNormal, origin, d: dot3(fallbackNormal, origin) };
    }
    if (!lastSlice.imagePositionPatient) {
      const offset =
        (sourceSeries.images.length - 1 - clampedSliceIndex) * (activeSlice.sliceThickness || 4);
      const origin: [number, number, number] = [
        activeSlice.imagePositionPatient[0] + fallbackNormal[0] * offset,
        activeSlice.imagePositionPatient[1] + fallbackNormal[1] * offset,
        activeSlice.imagePositionPatient[2] + fallbackNormal[2] * offset,
      ];
      lastPlane = { normal: fallbackNormal, origin, d: dot3(fallbackNormal, origin) };
    }
  }

  let slabStartLine: LocalizerLine | null = null;
  let slabEndLine: LocalizerLine | null = null;

  if (firstPlane && sourceSeries.images.length > 1) {
    slabStartLine = intersectPlaneWithTargetViewport(
      firstPlane,
      targetPlane,
      targetViewport,
      clipBounds
    );
  }

  if (lastPlane && sourceSeries.images.length > 1) {
    slabEndLine = intersectPlaneWithTargetViewport(
      lastPlane,
      targetPlane,
      targetViewport,
      clipBounds
    );
  }

  // 3. Calculate translucent slab polygon between slab start and end lines
  let slabPolygonPoints: string | null = null;
  if (slabStartLine && slabEndLine) {
    const a1 = { x: slabStartLine.x1, y: slabStartLine.y1 };
    const a2 = { x: slabStartLine.x2, y: slabStartLine.y2 };
    let b1 = { x: slabEndLine.x1, y: slabEndLine.y1 };
    let b2 = { x: slabEndLine.x2, y: slabEndLine.y2 };

    // Prevent bowtie / hourglass self-intersecting polygon
    const distDirect = Math.hypot(a1.x - b1.x, a1.y - b1.y) + Math.hypot(a2.x - b2.x, a2.y - b2.y);
    const distCross = Math.hypot(a1.x - b2.x, a1.y - b2.y) + Math.hypot(a2.x - b1.x, a2.y - b1.y);

    if (distCross < distDirect) {
      const tmp = b1;
      b1 = b2;
      b2 = tmp;
    }

    slabPolygonPoints = `${a1.x},${a1.y} ${a2.x},${a2.y} ${b2.x},${b2.y} ${b1.x},${b1.y}`;
  }

  return {
    activeLine,
    slabStartLine,
    slabEndLine,
    slabPolygonPoints,
    hasIntersection: !!(activeLine || slabStartLine || slabEndLine),
    isParallel: false,
    sourceSeriesDescription: sourceSeries.seriesDescription || 'Series',
  };
}
