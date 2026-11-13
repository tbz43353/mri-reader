import {
  init as coreInit,
  RenderingEngine,
  Enums,
  cache,
  imageLoader,
  type Types,
} from '@cornerstonejs/core';
import {
  init as toolsInit,
  addTool,
  ToolGroupManager,
  PanTool,
  ZoomTool,
  Enums as ToolEnums,
} from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import { readDicomBuffer } from './dicom';

// Constants
export const RENDERING_ENGINE_ID = 'mriReaderRenderingEngine';
export const DEFAULT_VIEWPORT_ID = 'mriReaderViewport-0';
export const VIEWPORT_IDS = [
  'mriReaderViewport-0',
  'mriReaderViewport-1',
  'mriReaderViewport-2',
  'mriReaderViewport-3',
] as const;
export const TOOL_GROUP_ID = 'mriReaderToolGroup';

// State
let renderingEngine: RenderingEngine | null = null;
let isInitialized = false;

// Per-viewport tracking
const viewportElements = new Map<string, HTMLDivElement>();
const activeSeriesUIDs = new Map<string, string>();
const viewportHandlers = new Map<string, ViewportHandlers>();

// Map file paths to imageIds from dicom-image-loader
const filePathToImageId = new Map<string, string>();

interface ViewportHandlers {
  onWheel: (evt: WheelEvent) => void;
  onTouchStart: (evt: TouchEvent) => void;
  onTouchMove: (evt: TouchEvent) => void;
  onTouchEnd: (evt: TouchEvent) => void;
  onContextMenu: (e: MouseEvent) => void;
  onMouseDown: (e: MouseEvent) => void;
}

export async function initializeCornerstone(container?: HTMLDivElement): Promise<void> {
  if (!isInitialized) {
    await coreInit();

    cornerstoneDICOMImageLoader.init({
      maxWebWorkers: navigator.hardwareConcurrency || 4,
    });

    await toolsInit();

    // Cache size: 2GB
    cache.setMaxCacheSize(2 * 1024 * 1024 * 1024);

    addTool(PanTool);
    addTool(ZoomTool);

    let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
    if (!toolGroup) {
      toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
      if (!toolGroup) {
        throw new Error('Failed to create tool group');
      }

      toolGroup.addTool(PanTool.toolName);
      toolGroup.addTool(ZoomTool.toolName);

      toolGroup.setToolActive(PanTool.toolName, {
        bindings: [
          { mouseButton: ToolEnums.MouseBindings.Primary },
          { mouseButton: ToolEnums.MouseBindings.Auxiliary },
        ],
      });

      toolGroup.setToolActive(ZoomTool.toolName, {
        bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
      });
    }

    renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);
    isInitialized = true;
    console.log('CornerstoneRender: initialized with multi-viewport and preloading');
  }

  if (container) {
    await enableViewport(DEFAULT_VIEWPORT_ID, container);
  }
}

function createViewportGestureHandlers(viewportId: string, element: HTMLDivElement): ViewportHandlers {
  let touchCount = 0;
  let touchStartDist = 0;
  let touchStartPan: Types.Point2 = [0, 0];
  let touchStartZoom = 1;
  let touchStartMidX = 0;
  let touchStartMidY = 0;
  let touchStartSingleX = 0;
  let touchStartSingleY = 0;

  function onWheel(evt: WheelEvent): void {
    if (!renderingEngine) return;
    const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
    if (!viewport) return;

    evt.preventDefault();
    evt.stopPropagation();

    if (evt.ctrlKey) {
      // Two-finger pinch to zoom in/out
      const rect = element.getBoundingClientRect();
      const canvasPos: Types.Point2 = [evt.clientX - rect.left, evt.clientY - rect.top];
      const worldPosBefore = viewport.canvasToWorld(canvasPos);

      const currentZoom = viewport.getZoom();
      const zoomFactor = Math.exp(-evt.deltaY * 0.006);
      const newZoom = Math.max(0.1, Math.min(15, currentZoom * zoomFactor));

      viewport.setZoom(newZoom);

      const canvasPosAfter = viewport.worldToCanvas(worldPosBefore);
      const canvasDeltaX = canvasPos[0] - canvasPosAfter[0];
      const canvasDeltaY = canvasPos[1] - canvasPosAfter[1];

      const currentPan = viewport.getPan();
      viewport.setPan([currentPan[0] + canvasDeltaX, currentPan[1] + canvasDeltaY]);
      viewport.render();
      notifyCameraChange();
    } else {
      // Two-finger trackpad pan (reduced by half for smoother control)
      const currentPan = viewport.getPan();
      viewport.setPan([currentPan[0] - evt.deltaX * 0.5, currentPan[1] - evt.deltaY * 0.5]);
      viewport.render();
      notifyCameraChange();
    }
  }

  function onTouchStart(evt: TouchEvent): void {
    if (!renderingEngine) return;
    const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
    if (!viewport) return;

    touchCount = evt.touches.length;

    if (touchCount === 1) {
      touchStartSingleX = evt.touches[0].clientX;
      touchStartSingleY = evt.touches[0].clientY;
      touchStartPan = [...viewport.getPan()] as Types.Point2;
    } else if (touchCount === 2) {
      const t0 = evt.touches[0];
      const t1 = evt.touches[1];
      touchStartDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      touchStartMidX = (t0.clientX + t1.clientX) / 2;
      touchStartMidY = (t0.clientY + t1.clientY) / 2;
      touchStartPan = [...viewport.getPan()] as Types.Point2;
      touchStartZoom = viewport.getZoom();
      evt.preventDefault();
    }
  }

  function onTouchMove(evt: TouchEvent): void {
    if (!renderingEngine) return;
    const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
    if (!viewport) return;

    if (evt.touches.length === 1 && touchCount === 1) {
      evt.preventDefault();
      const dx = evt.touches[0].clientX - touchStartSingleX;
      const dy = evt.touches[0].clientY - touchStartSingleY;
      viewport.setPan([touchStartPan[0] + dx, touchStartPan[1] + dy]);
      viewport.render();
      notifyCameraChange();
    } else if (evt.touches.length === 2) {
      evt.preventDefault();
      const t0 = evt.touches[0];
      const t1 = evt.touches[1];

      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;
      const dx = midX - touchStartMidX;
      const dy = midY - touchStartMidY;

      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      if (touchStartDist > 0) {
        const scale = dist / touchStartDist;
        const newZoom = Math.max(0.1, Math.min(15, touchStartZoom * scale));
        viewport.setZoom(newZoom);
      }

      // Two-finger pan at half speed for precision
      viewport.setPan([touchStartPan[0] + dx * 0.5, touchStartPan[1] + dy * 0.5]);
      viewport.render();
      notifyCameraChange();
    }
  }

  function onTouchEnd(evt: TouchEvent): void {
    touchCount = evt.touches.length;
    if (touchCount === 1 && renderingEngine) {
      const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
      if (viewport) {
        touchStartSingleX = evt.touches[0].clientX;
        touchStartSingleY = evt.touches[0].clientY;
        touchStartPan = [...viewport.getPan()] as Types.Point2;
      }
    }
  }

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
  }

  function onMouseDown(e: MouseEvent): void {
    if (e.button === 2) {
      e.preventDefault();
    }
  }

  return { onWheel, onTouchStart, onTouchMove, onTouchEnd, onContextMenu, onMouseDown };
}

export async function enableViewport(viewportId: string, container: HTMLDivElement): Promise<void> {
  if (!renderingEngine) {
    await initializeCornerstone();
  }
  if (!renderingEngine) {
    throw new Error('Failed to initialize rendering engine');
  }

  if (viewportElements.has(viewportId)) {
    disableViewport(viewportId);
  }

  viewportElements.set(viewportId, container);

  renderingEngine.enableElement({
    viewportId,
    element: container,
    type: Enums.ViewportType.STACK,
  });

  const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (toolGroup) {
    try {
      toolGroup.addViewport(viewportId, RENDERING_ENGINE_ID);
    } catch {
      // Ignore
    }
  }

  const handlers = createViewportGestureHandlers(viewportId, container);
  viewportHandlers.set(viewportId, handlers);

  container.addEventListener('wheel', handlers.onWheel, { passive: false });
  container.addEventListener('touchstart', handlers.onTouchStart, { passive: false });
  container.addEventListener('touchmove', handlers.onTouchMove, { passive: false });
  container.addEventListener('touchend', handlers.onTouchEnd, { passive: true });
  container.addEventListener('contextmenu', handlers.onContextMenu);
  container.addEventListener('mousedown', handlers.onMouseDown);
  container.addEventListener(Enums.Events.CAMERA_MODIFIED, notifyCameraChange);

  renderingEngine.resize(true, true);
}

export function disableViewport(viewportId: string): void {
  const container = viewportElements.get(viewportId);
  const handlers = viewportHandlers.get(viewportId);

  if (container && handlers) {
    container.removeEventListener('wheel', handlers.onWheel);
    container.removeEventListener('touchstart', handlers.onTouchStart);
    container.removeEventListener('touchmove', handlers.onTouchMove);
    container.removeEventListener('touchend', handlers.onTouchEnd);
    container.removeEventListener('contextmenu', handlers.onContextMenu);
    container.removeEventListener('mousedown', handlers.onMouseDown);
    container.removeEventListener(Enums.Events.CAMERA_MODIFIED, notifyCameraChange);
  }

  viewportElements.delete(viewportId);
  viewportHandlers.delete(viewportId);
  activeSeriesUIDs.delete(viewportId);

  const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (toolGroup) {
    try {
      toolGroup.removeViewports(RENDERING_ENGINE_ID, viewportId);
    } catch {
      // Ignore
    }
  }

  if (renderingEngine) {
    try {
      renderingEngine.disableElement(viewportId);
    } catch {
      // Ignore
    }
  }
}

export function getViewport(viewportId: string = DEFAULT_VIEWPORT_ID): Types.IStackViewport | null {
  if (!renderingEngine) return null;
  return (renderingEngine.getViewport(viewportId) as Types.IStackViewport) || null;
}

export function getRenderingEngine(): RenderingEngine | null {
  return renderingEngine;
}

/**
 * Get or register imageId from DICOM buffer reader.
 */
export async function getOrCreateImageId(filePath: string): Promise<string> {
  let imageId = filePathToImageId.get(filePath);

  if (!imageId) {
    const uint8 = await readDicomBuffer(filePath);
    const copy = new Uint8Array(uint8.byteLength);
    copy.set(uint8);

    const blob = new Blob([copy.buffer as ArrayBuffer], { type: 'application/dicom' });
    imageId = cornerstoneDICOMImageLoader.wadouri.fileManager.add(blob);
    filePathToImageId.set(filePath, imageId);
  }

  return imageId;
}

/**
 * Predictive background prefetching and decoding of adjacent slices.
 * Ensures zero-latency 60 FPS transitions during rapid scrubbing and Cine playback.
 */
export function prefetchAdjacentSlices(
  filePaths: string[],
  currentIndex: number,
  windowRadius = 4
): void {
  if (!filePaths || filePaths.length === 0) return;

  const targetIndices: number[] = [];
  for (let r = 1; r <= windowRadius; r++) {
    if (currentIndex + r < filePaths.length) targetIndices.push(currentIndex + r);
    if (currentIndex - r >= 0) targetIndices.push(currentIndex - r);
  }

  const runner =
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback
      : (fn: () => void) => setTimeout(fn, 16);

  runner(async () => {
    for (const idx of targetIndices) {
      try {
        const path = filePaths[idx];
        if (path) {
          const imageId = await getOrCreateImageId(path);
          imageLoader.loadAndCacheImage(imageId).catch(() => {});
        }
      } catch {
        // Ignore background prefetch errors
      }
    }
  });
}

/**
 * Calculate optimal VOI range for medical images.
 */
function calculateOptimalVOI(
  stackViewport: Types.IStackViewport
): { lower: number; upper: number } | null {
  try {
    const csImage = stackViewport.getCornerstoneImage?.();
    if (!csImage) return null;

    const wc =
      typeof csImage.windowCenter === 'number'
        ? csImage.windowCenter
        : Array.isArray(csImage.windowCenter)
        ? csImage.windowCenter[0]
        : undefined;
    const ww =
      typeof csImage.windowWidth === 'number'
        ? csImage.windowWidth
        : Array.isArray(csImage.windowWidth)
        ? csImage.windowWidth[0]
        : undefined;

    if (wc !== undefined && ww !== undefined && ww > 1) {
      return {
        lower: wc - ww / 2,
        upper: wc + ww / 2,
      };
    }

    const pixelData = csImage.getPixelData?.();
    if (pixelData && pixelData.length > 0) {
      const step = Math.max(1, Math.floor(pixelData.length / 50000));
      const sample: number[] = [];
      for (let i = 0; i < pixelData.length; i += step) {
        sample.push(pixelData[i]);
      }
      sample.sort((a, b) => a - b);

      const p5Index = Math.floor(sample.length * 0.05);
      const p99Index = Math.floor(sample.length * 0.99);
      let lower = sample[p5Index] ?? sample[0];
      let upper = sample[p99Index] ?? sample[sample.length - 1];

      if (upper <= lower) {
        lower = csImage.minPixelValue ?? 0;
        upper = csImage.maxPixelValue ?? 255;
      }
      if (upper <= lower) {
        upper = lower + 255;
      }

      return { lower, upper };
    }

    const min = csImage.minPixelValue ?? 0;
    const max = csImage.maxPixelValue ?? 255;
    if (max > min) {
      return { lower: min, upper: max };
    }
  } catch (err) {
    console.warn('[Cornerstone] Error calculating optimal VOI:', err);
  }
  return null;
}

export async function loadImageToViewport(
  filePath: string,
  seriesInstanceUID?: string,
  viewportId: string = DEFAULT_VIEWPORT_ID
): Promise<void> {
  if (!renderingEngine) {
    throw new Error('Rendering engine not initialized');
  }

  const viewport = renderingEngine.getViewport(viewportId);
  if (!viewport) {
    throw new Error(`Viewport ${viewportId} not found`);
  }

  const imageId = await getOrCreateImageId(filePath);
  const stackViewport = viewport as Types.IStackViewport;

  try {
    const currentSeriesUID = activeSeriesUIDs.get(viewportId);
    const isSameSeries = !!(seriesInstanceUID && currentSeriesUID === seriesInstanceUID);
    const prevCamera = isSameSeries ? stackViewport.getCamera() : null;

    try {
      await stackViewport.setStack([imageId]);
    } catch (loadErr) {
      console.warn('[Cornerstone] GPU setStack failed, attempting CPU fallback:', loadErr);
      if (typeof stackViewport.setUseCPURendering === 'function') {
        stackViewport.setUseCPURendering(true);
        await stackViewport.setStack([imageId]);
      } else {
        throw loadErr;
      }
    }

    renderingEngine.resize(true, true);

    if (isSameSeries && prevCamera) {
      stackViewport.setCamera(prevCamera);
    } else {
      stackViewport.resetCamera();
    }

    applyAdjustmentsToViewport(
      stackViewport,
      activeAdjustments.brightness,
      activeAdjustments.contrast,
      activeAdjustments.invert,
      activeAdjustments.presetId
    );

    if (seriesInstanceUID) {
      activeSeriesUIDs.set(viewportId, seriesInstanceUID);
    }

    stackViewport.render();
    notifyCameraChange();
  } catch (err) {
    console.error(`[Cornerstone] Error loading image to ${viewportId}:`, err);
    throw err;
  }
}

let activeAdjustments = {
  brightness: 0,
  contrast: 0,
  invert: false,
  presetId: 'auto',
};

function applyAdjustmentsToViewport(
  viewport: Types.IStackViewport,
  brightness: number,
  contrast: number,
  invert: boolean,
  presetId: string = 'auto'
): void {
  const optimalVOI = calculateOptimalVOI(viewport);
  if (!optimalVOI) return;

  let baseWC = (optimalVOI.lower + optimalVOI.upper) / 2;
  let baseWW = Math.max(10, optimalVOI.upper - optimalVOI.lower);

  if (presetId === 'high-contrast') {
    baseWW = Math.max(10, baseWW * 0.55);
  } else if (presetId === 'brain') {
    baseWC = optimalVOI.lower + baseWW * 0.45;
    baseWW = Math.max(10, baseWW * 0.7);
  } else if (presetId === 'soft-tissue') {
    baseWC = optimalVOI.lower + baseWW * 0.5;
    baseWW = Math.max(10, baseWW * 0.85);
  } else if (presetId === 'bone') {
    baseWC = optimalVOI.lower + baseWW * 0.65;
    baseWW = Math.max(10, baseWW * 1.25);
  }

  const deltaWC = -(brightness / 100) * (baseWW * 0.5);
  const newWC = baseWC + deltaWC;

  let contrastFactor = 1.0;
  if (contrast >= 0) {
    contrastFactor = 1 - (contrast / 100) * 0.75;
  } else {
    contrastFactor = 1 + (-contrast / 100) * 1.5;
  }
  const newWW = Math.max(5, baseWW * contrastFactor);

  const lower = newWC - newWW / 2;
  const upper = newWC + newWW / 2;

  viewport.setProperties({
    voiRange: { lower, upper },
    invert: !!invert,
    interpolationType: Enums.InterpolationType.LINEAR,
  });
  viewport.render();
}

export function applyAdjustments(
  brightness: number,
  contrast: number,
  invert: boolean,
  presetId: string = 'auto',
  targetViewportId?: string
): void {
  activeAdjustments = {
    brightness,
    contrast,
    invert,
    presetId,
  };

  if (!renderingEngine) return;

  if (targetViewportId) {
    const vp = renderingEngine.getViewport(targetViewportId) as Types.IStackViewport;
    if (vp) applyAdjustmentsToViewport(vp, brightness, contrast, invert, presetId);
  } else {
    for (const vp of renderingEngine.getViewports()) {
      if (vp) applyAdjustmentsToViewport(vp as Types.IStackViewport, brightness, contrast, invert, presetId);
    }
  }
}

export function setWindowLevel(
  windowCenter?: number,
  windowWidth?: number,
  presetId?: string,
  targetViewportId?: string
): void {
  if (presetId) {
    applyAdjustments(0, 0, false, presetId, targetViewportId);
    return;
  }

  if (!renderingEngine) return;

  const viewportsToUpdate = targetViewportId
    ? [renderingEngine.getViewport(targetViewportId) as Types.IStackViewport].filter(Boolean)
    : (renderingEngine.getViewports() as Types.IStackViewport[]);

  for (const viewport of viewportsToUpdate) {
    if (!viewport) continue;
    if (windowCenter !== undefined && windowWidth !== undefined && windowWidth > 0) {
      viewport.setProperties({
        voiRange: { lower: windowCenter - windowWidth / 2, upper: windowCenter + windowWidth / 2 },
        interpolationType: Enums.InterpolationType.LINEAR,
      });
      viewport.render();
    } else {
      applyAdjustmentsToViewport(viewport, 0, 0, false, 'auto');
    }
  }
}

export function resetViewport(viewportId?: string): void {
  activeAdjustments = {
    brightness: 0,
    contrast: 0,
    invert: false,
    presetId: 'auto',
  };

  if (!renderingEngine) return;

  const viewportsToReset = viewportId
    ? [renderingEngine.getViewport(viewportId) as Types.IStackViewport].filter(Boolean)
    : (renderingEngine.getViewports() as Types.IStackViewport[]);

  for (const vp of viewportsToReset) {
    if (vp) {
      try {
        if (typeof (vp as any).resetProperties === 'function') {
          (vp as any).resetProperties();
        }
        if (typeof vp.setPan === 'function') {
          vp.setPan([0, 0]);
        }
        vp.resetCamera();
        applyAdjustmentsToViewport(vp, 0, 0, false, 'auto');
        vp.render();
      } catch (err) {
        console.warn('[Cornerstone] Error during viewport reset:', err);
      }
    }
  }

  notifyCameraChange();
}

export function resizeViewport(): void {
  if (!renderingEngine) return;
  renderingEngine.resize(true, true);
  notifyCameraChange();
}

export interface ViewportTransform {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export function getViewportTransform(
  imageWidth: number,
  imageHeight: number,
  viewportId: string = DEFAULT_VIEWPORT_ID
): ViewportTransform | null {
  if (!renderingEngine) return null;

  const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
  const container = viewportElements.get(viewportId);
  if (!viewport || !container) return null;

  try {
    const imageData = viewport.getImageData?.();
    if (imageData && imageData.origin && imageData.spacing && imageData.direction) {
      const { origin, spacing, direction } = imageData;
      const iVector = direction.slice(0, 3);
      const jVector = direction.slice(3, 6);

      const canvasTL = viewport.worldToCanvas(origin);
      const brWorld: Types.Point3 = [
        origin[0] + iVector[0] * imageWidth * spacing[0] + jVector[0] * imageHeight * spacing[1],
        origin[1] + iVector[1] * imageWidth * spacing[0] + jVector[1] * imageHeight * spacing[1],
        origin[2] + iVector[2] * imageWidth * spacing[0] + jVector[2] * imageHeight * spacing[1],
      ];
      const canvasBR = viewport.worldToCanvas(brWorld);

      if (canvasTL && canvasBR && !Number.isNaN(canvasTL[0]) && !Number.isNaN(canvasBR[0])) {
        const originX = Math.min(canvasTL[0], canvasBR[0]);
        const originY = Math.min(canvasTL[1], canvasBR[1]);
        const width = Math.abs(canvasBR[0] - canvasTL[0]);
        const height = Math.abs(canvasBR[1] - canvasTL[1]);

        if (width > 0 && height > 0) {
          return { originX, originY, width, height };
        }
      }
    }
  } catch {
    // Fall back to geometric calculation
  }

  const zoom = viewport.getZoom();
  const pan = viewport.getPan();

  const rect = container.getBoundingClientRect();
  const canvasWidth = rect.width;
  const canvasHeight = rect.height;

  const fitScaleX = canvasWidth / imageWidth;
  const fitScaleY = canvasHeight / imageHeight;
  const fitScale = Math.min(fitScaleX, fitScaleY);

  const renderedWidth = imageWidth * fitScale * zoom;
  const renderedHeight = imageHeight * fitScale * zoom;

  const centerX = canvasWidth / 2 + pan[0];
  const centerY = canvasHeight / 2 + pan[1];
  const originX = centerX - renderedWidth / 2;
  const originY = centerY - renderedHeight / 2;

  return {
    originX,
    originY,
    width: renderedWidth,
    height: renderedHeight,
  };
}

/**
 * Coordinate conversion: Canvas pixels to Image pixel coordinates.
 */
export function canvasToImageCoords(
  canvasPos: [number, number],
  imageWidth: number,
  imageHeight: number,
  viewportId: string = DEFAULT_VIEWPORT_ID
): [number, number] | null {
  const transform = getViewportTransform(imageWidth, imageHeight, viewportId);
  if (!transform || transform.width <= 0 || transform.height <= 0) return null;

  const ix = ((canvasPos[0] - transform.originX) / transform.width) * imageWidth;
  const iy = ((canvasPos[1] - transform.originY) / transform.height) * imageHeight;
  return [ix, iy];
}

/**
 * Coordinate conversion: Image pixel coordinates to Canvas pixels.
 */
export function imageToCanvasCoords(
  imagePos: [number, number],
  imageWidth: number,
  imageHeight: number,
  viewportId: string = DEFAULT_VIEWPORT_ID
): [number, number] | null {
  const transform = getViewportTransform(imageWidth, imageHeight, viewportId);
  if (!transform) return null;

  const cx = transform.originX + (imagePos[0] / imageWidth) * transform.width;
  const cy = transform.originY + (imagePos[1] / imageHeight) * transform.height;
  return [cx, cy];
}

/**
 * Live signal intensity (HU / grayscale value) under pixel cursor.
 */
export function getPixelValueAt(
  imageCoords: [number, number],
  viewportId: string = DEFAULT_VIEWPORT_ID
): number | null {
  if (!renderingEngine) return null;
  const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
  if (!viewport) return null;

  try {
    const csImage = viewport.getCornerstoneImage?.();
    if (!csImage) return null;
    const pixelData = csImage.getPixelData?.();
    if (!pixelData) return null;

    const x = Math.floor(imageCoords[0]);
    const y = Math.floor(imageCoords[1]);
    if (x < 0 || x >= csImage.columns || y < 0 || y >= csImage.rows) return null;

    const idx = y * csImage.columns + x;
    return pixelData[idx] ?? null;
  } catch {
    return null;
  }
}

/**
 * Calculate ROI statistics (Mean, StdDev, Min, Max) inside a bounding box.
 */
export function getROIStats(
  box: { xMin: number; xMax: number; yMin: number; yMax: number },
  viewportId: string = DEFAULT_VIEWPORT_ID
): { mean: number; stdDev: number; min: number; max: number; count: number } | null {
  if (!renderingEngine) return null;
  const viewport = renderingEngine.getViewport(viewportId) as Types.IStackViewport;
  if (!viewport) return null;

  try {
    const csImage = viewport.getCornerstoneImage?.();
    if (!csImage) return null;
    const pixelData = csImage.getPixelData?.();
    if (!pixelData) return null;

    const x0 = Math.max(0, Math.floor(box.xMin));
    const x1 = Math.min(csImage.columns - 1, Math.ceil(box.xMax));
    const y0 = Math.max(0, Math.floor(box.yMin));
    const y1 = Math.min(csImage.rows - 1, Math.ceil(box.yMax));

    if (x1 <= x0 || y1 <= y0) return null;

    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    let count = 0;

    for (let y = y0; y <= y1; y++) {
      const rowOffset = y * csImage.columns;
      for (let x = x0; x <= x1; x++) {
        const val = pixelData[rowOffset + x];
        sum += val;
        if (val < min) min = val;
        if (val > max) max = val;
        count++;
      }
    }

    if (count === 0) return null;
    const mean = sum / count;

    let sumSqDiff = 0;
    for (let y = y0; y <= y1; y++) {
      const rowOffset = y * csImage.columns;
      for (let x = x0; x <= x1; x++) {
        const diff = pixelData[rowOffset + x] - mean;
        sumSqDiff += diff * diff;
      }
    }
    const stdDev = Math.sqrt(sumSqDiff / count);

    return {
      mean: Math.round(mean * 10) / 10,
      stdDev: Math.round(stdDev * 10) / 10,
      min,
      max,
      count,
    };
  } catch {
    return null;
  }
}

/**
 * Capture viewport canvas as an image data URL for export.
 */
export function captureViewportCanvas(viewportId: string = DEFAULT_VIEWPORT_ID): HTMLCanvasElement | null {
  const container = viewportElements.get(viewportId);
  if (!container) return null;
  return container.querySelector('canvas');
}

type CameraCallback = () => void;
const cameraCallbacks = new Set<CameraCallback>();

export function subscribeToCamera(callback: CameraCallback): () => void {
  cameraCallbacks.add(callback);
  return () => cameraCallbacks.delete(callback);
}

function notifyCameraChange(): void {
  for (const callback of cameraCallbacks) {
    callback();
  }
}

export function cleanup(): void {
  for (const id of Array.from(viewportElements.keys())) {
    disableViewport(id);
  }

  if (renderingEngine) {
    renderingEngine.destroy();
    renderingEngine = null;
  }

  isInitialized = false;
  cameraCallbacks.clear();
  filePathToImageId.clear();
  cache.purgeCache();
}
