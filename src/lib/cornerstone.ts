import {
  init as coreInit,
  RenderingEngine,
  Enums,
  cache,
  type Types,
} from '@cornerstonejs/core';
import {
  init as toolsInit,
  addTool,
  ToolGroupManager,
  WindowLevelTool,
  PanTool,
  StackScrollTool,
  Enums as ToolEnums,
} from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

// Constants
const RENDERING_ENGINE_ID = 'mriReaderRenderingEngine';
const VIEWPORT_ID = 'mriReaderViewport';
const TOOL_GROUP_ID = 'mriReaderToolGroup';

// State
let renderingEngine: RenderingEngine | null = null;
let isInitialized = false;
let viewportElement: HTMLDivElement | null = null;

// Map file paths to imageIds from dicom-image-loader
const filePathToImageId = new Map<string, string>();

export async function initializeCornerstone(container: HTMLDivElement): Promise<void> {
  if (isInitialized) {
    // Just set up the viewport in the new container
    await setupViewport(container);
    return;
  }

  // Initialize core
  await coreInit();

  // Initialize DICOM image loader (uses web workers for decoding)
  cornerstoneDICOMImageLoader.init({
    maxWebWorkers: navigator.hardwareConcurrency || 4,
  });

  // Initialize tools
  await toolsInit();

  // Configure cache for desktop (larger than web default)
  cache.setMaxCacheSize(2 * 1024 * 1024 * 1024); // 2GB

  // Add tools
  addTool(WindowLevelTool);
  addTool(PanTool);
  addTool(StackScrollTool);

  // Get or create tool group (may already exist from previous initialization)
  let toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (!toolGroup) {
    toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
    if (!toolGroup) {
      throw new Error('Failed to create tool group');
    }

    toolGroup.addTool(WindowLevelTool.toolName);
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(StackScrollTool.toolName);

    // Set tool bindings
    // Left-drag: Adjust window/level (brightness/contrast)
    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
    });
    // Scroll wheel: Browse slices
    toolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
    });
    // Middle-drag or right-drag: Pan
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [
        { mouseButton: ToolEnums.MouseBindings.Auxiliary },
        { mouseButton: ToolEnums.MouseBindings.Secondary },
      ],
    });
    // Zoom: Ctrl+scroll (custom handler, not via tool binding)
  }

  isInitialized = true;
  console.log('CornerstoneRender: initialized with dicom-image-loader');

  // Set up viewport
  await setupViewport(container);
}

// Custom Ctrl+wheel zoom handler with cursor-centered zoom
function handleCtrlWheelZoom(evt: WheelEvent): void {
  if (!evt.ctrlKey || !renderingEngine || !viewportElement) return;

  // Prevent default browser zoom and stop Cornerstone from handling it
  evt.preventDefault();
  evt.stopPropagation();

  const viewport = renderingEngine.getViewport(VIEWPORT_ID);
  if (!viewport) return;

  // Get cursor position relative to viewport element
  const rect = viewportElement.getBoundingClientRect();
  const canvasPos: Types.Point2 = [evt.clientX - rect.left, evt.clientY - rect.top];

  // Get the world position under the cursor BEFORE zoom
  const worldPosBefore = viewport.canvasToWorld(canvasPos);

  // Calculate new zoom
  const currentZoom = viewport.getZoom();
  const zoomFactor = evt.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.max(0.1, Math.min(10, currentZoom * zoomFactor));

  // Apply zoom
  viewport.setZoom(newZoom);

  // Get where that world point is NOW on canvas (after zoom)
  const canvasPosAfter = viewport.worldToCanvas(worldPosBefore);

  // Calculate the canvas delta (where point moved to vs where cursor is)
  const canvasDeltaX = canvasPos[0] - canvasPosAfter[0];
  const canvasDeltaY = canvasPos[1] - canvasPosAfter[1];

  // Adjust pan to bring the world point back under cursor
  const currentPan = viewport.getPan();
  viewport.setPan([currentPan[0] + canvasDeltaX, currentPan[1] + canvasDeltaY]);

  viewport.render();

  // Notify overlay subscribers
  notifyCameraChange();
}

async function setupViewport(container: HTMLDivElement): Promise<void> {
  // Debug: Check container dimensions
  const rect = container.getBoundingClientRect();
  console.log('[Cornerstone] Container dimensions:', {
    width: rect.width,
    height: rect.height,
  });

  // Remove previous event handlers if any
  if (viewportElement) {
    viewportElement.removeEventListener('wheel', handleCtrlWheelZoom);
    viewportElement.removeEventListener(Enums.Events.CAMERA_MODIFIED, notifyCameraChange);
  }

  // Remove viewport from tool group before destroying (to clear stale references)
  const existingToolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (existingToolGroup) {
    try {
      existingToolGroup.removeViewports(RENDERING_ENGINE_ID);
    } catch {
      // Ignore if viewport wasn't added yet
    }
  }

  // Clean up existing rendering engine
  if (renderingEngine) {
    renderingEngine.destroy();
  }

  // Store container reference
  viewportElement = container;

  // Create rendering engine
  renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);

  // Create viewport
  renderingEngine.enableElement({
    viewportId: VIEWPORT_ID,
    element: container,
    type: Enums.ViewportType.STACK,
  });

  // Add viewport to tool group
  const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID);
  if (toolGroup) {
    toolGroup.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);
  }

  // Add custom Ctrl+wheel zoom handler (passive: false to allow preventDefault)
  container.addEventListener('wheel', handleCtrlWheelZoom, { passive: false });

  // Subscribe to Cornerstone camera events (for pan tool, etc.)
  const viewport = renderingEngine.getViewport(VIEWPORT_ID);
  if (viewport) {
    const element = viewport.element;
    element.addEventListener(Enums.Events.CAMERA_MODIFIED, notifyCameraChange);
  }

  // Prevent context menu on right-click to allow right-drag for ZoomTool
  container.addEventListener('contextmenu', (e) => e.preventDefault());

  // Prevent default on right mousedown to ensure ZoomTool can capture the drag
  container.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
      e.preventDefault();
    }
  });
}

export async function loadImageToViewport(filePath: string): Promise<void> {
  if (!renderingEngine) {
    throw new Error('Rendering engine not initialized');
  }

  const viewport = renderingEngine.getViewport(VIEWPORT_ID);
  if (!viewport) {
    throw new Error('Viewport not found');
  }

  console.log('[Cornerstone] Loading image:', filePath);

  // Check if we already have an imageId for this file
  let imageId = filePathToImageId.get(filePath);

  if (!imageId) {
    // Read file via Electron IPC
    const buffer = await window.electronAPI.readFile(filePath);

    // Convert Buffer to ArrayBuffer
    const arrayBuffer = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(arrayBuffer).set(
      new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    );

    // Create a Blob and register with dicom-image-loader's fileManager
    const blob = new Blob([arrayBuffer], { type: 'application/dicom' });
    imageId = cornerstoneDICOMImageLoader.wadouri.fileManager.add(blob);

    // Cache the mapping
    filePathToImageId.set(filePath, imageId);
    console.log('[Cornerstone] Registered image with fileManager:', imageId);
  }

  // Load and display image
  const stackViewport = viewport as Types.IStackViewport;
  try {
    await stackViewport.setStack([imageId]);
    console.log('[Cornerstone] Stack set successfully');

    // Reset camera to fit image to viewport (default behavior preserves aspect ratio)
    stackViewport.resetCamera();

    // Render
    stackViewport.render();
    console.log('[Cornerstone] Render called');
  } catch (err) {
    console.error('[Cornerstone] Error loading image:', err);
    throw err;
  }
}

export function resetViewport(): void {
  if (!renderingEngine) return;

  const viewport = renderingEngine.getViewport(VIEWPORT_ID);
  if (!viewport) return;

  const stackViewport = viewport as Types.IStackViewport;
  // Reset both properties (window/level) and camera (zoom/pan)
  stackViewport.resetProperties();
  stackViewport.resetCamera();
  stackViewport.render();

  // Notify overlay subscribers
  notifyCameraChange();
}

export function resizeViewport(): void {
  if (!renderingEngine) return;

  // Resize the rendering engine (recalculates canvas size)
  // Parameters: immediate=true, keepCamera=true (preserve zoom/pan state)
  renderingEngine.resize(true, true);

  // Notify overlay subscribers since transform changes with container size
  notifyCameraChange();
}

export interface ViewportTransform {
  // Position of image origin (0,0) in canvas pixels
  originX: number;
  originY: number;
  // Rendered image size on canvas in pixels
  width: number;
  height: number;
}

/**
 * Get the current viewport transform for positioning overlays.
 * Returns where the image is rendered on the canvas (position and size in pixels).
 */
export function getViewportTransform(imageWidth: number, imageHeight: number): ViewportTransform | null {
  if (!renderingEngine || !viewportElement) return null;

  const viewport = renderingEngine.getViewport(VIEWPORT_ID) as Types.IStackViewport;
  if (!viewport) return null;

  // Get current zoom and calculate rendered size
  const zoom = viewport.getZoom();
  const pan = viewport.getPan();

  // Calculate the rendered image size based on zoom
  // At zoom=1, the image fits within the viewport (may have letterboxing)
  const rect = viewportElement.getBoundingClientRect();
  const canvasWidth = rect.width;
  const canvasHeight = rect.height;

  // Calculate fit scale (how the image fits at zoom=1)
  const fitScaleX = canvasWidth / imageWidth;
  const fitScaleY = canvasHeight / imageHeight;
  const fitScale = Math.min(fitScaleX, fitScaleY);

  // Actual rendered size
  const renderedWidth = imageWidth * fitScale * zoom;
  const renderedHeight = imageHeight * fitScale * zoom;

  // Calculate origin (center of canvas + pan offset - half of rendered size)
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

type CameraCallback = () => void;
const cameraCallbacks = new Set<CameraCallback>();

/**
 * Subscribe to viewport camera changes (zoom, pan).
 * Returns an unsubscribe function.
 */
export function subscribeToCamera(callback: CameraCallback): () => void {
  cameraCallbacks.add(callback);
  return () => cameraCallbacks.delete(callback);
}

// Notify all subscribers of camera changes
function notifyCameraChange(): void {
  for (const callback of cameraCallbacks) {
    callback();
  }
}

export function cleanup(): void {
  // Remove wheel handler
  if (viewportElement) {
    viewportElement.removeEventListener('wheel', handleCtrlWheelZoom);
    viewportElement = null;
  }

  if (renderingEngine) {
    renderingEngine.destroy();
    renderingEngine = null;
  }

  // Clear callbacks
  cameraCallbacks.clear();

  // Clear file path cache
  filePathToImageId.clear();

  // Clear cornerstone cache
  cache.purgeCache();
}
