import { useEffect, useRef, useState, useCallback } from 'react';
import { useCurrentImage, useCurrentImagePresentationState } from '../lib/store';
import { subscribeToCamera, getViewportTransform, type ViewportTransform } from '../lib/cornerstone';
import type { GraphicAnnotation, GraphicOverlay } from '../types';

export default function AnnotationOverlay() {
  const currentImage = useCurrentImage();
  const presentationState = useCurrentImagePresentationState();
  const [transform, setTransform] = useState<ViewportTransform | null>(null);

  const graphicAnnotations = presentationState?.graphicAnnotations ?? [];
  const graphicOverlays = currentImage?.overlays ?? [];

  const hasAnnotations = graphicAnnotations.length > 0;
  const hasOverlays = graphicOverlays.length > 0;

  const imageWidth = currentImage?.columns ?? 0;
  const imageHeight = currentImage?.rows ?? 0;

  // Subscribe to camera changes to update overlay position
  const updateTransform = useCallback(() => {
    if (imageWidth > 0 && imageHeight > 0) {
      setTransform(getViewportTransform(imageWidth, imageHeight));
    }
  }, [imageWidth, imageHeight]);

  useEffect(() => {
    // Get initial transform after a short delay to ensure viewport is ready
    const timer = setTimeout(updateTransform, 50);

    // Subscribe to camera changes
    const unsubscribe = subscribeToCamera(updateTransform);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [updateTransform]);

  if (!hasAnnotations && !hasOverlays) return null;
  if (!transform) return null;

  // Position and size the overlay to match where the image is rendered
  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    left: transform.originX,
    top: transform.originY,
    width: transform.width,
    height: transform.height,
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div style={overlayStyle}>
        {/* Bitmap overlays (from image 60xx groups) */}
        {hasOverlays && (
          <BitmapOverlayLayer
            overlays={graphicOverlays}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
          />
        )}

        {/* Vector annotations (from PR files) */}
        {hasAnnotations && (
          <VectorAnnotationLayer
            annotations={graphicAnnotations}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
          />
        )}
      </div>
    </div>
  );
}

// Render bitmap overlays as canvas
function BitmapOverlayLayer({
  overlays,
  imageWidth,
  imageHeight,
}: {
  overlays: GraphicOverlay[];
  imageWidth: number;
  imageHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || overlays.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match image dimensions
    canvas.width = imageWidth;
    canvas.height = imageHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render each overlay
    for (const overlay of overlays) {
      renderOverlay(ctx, overlay);
    }
  }, [overlays, imageWidth, imageHeight]);

  if (imageWidth === 0 || imageHeight === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{
        imageRendering: 'pixelated',
        mixBlendMode: 'screen',
      }}
    />
  );
}

function renderOverlay(ctx: CanvasRenderingContext2D, overlay: GraphicOverlay) {
  // Overlay origin is 1-based, convert to 0-based
  const startRow = (overlay.origin[0] ?? 1) - 1;
  const startCol = (overlay.origin[1] ?? 1) - 1;

  // Create ImageData for the overlay region
  const imageData = ctx.createImageData(overlay.columns, overlay.rows);

  // Choose color based on overlay type
  // ROI overlays in green, graphics overlays in yellow
  const color = overlay.type === 'R' ? [0, 255, 0] : [255, 255, 0];

  // Fill pixel data
  for (let i = 0; i < overlay.data.length; i++) {
    if (overlay.data[i]) {
      const idx = i * 4;
      imageData.data[idx] = color[0]; // R
      imageData.data[idx + 1] = color[1]; // G
      imageData.data[idx + 2] = color[2]; // B
      imageData.data[idx + 3] = 180; // A (semi-transparent)
    }
  }

  // Draw at the correct position
  ctx.putImageData(imageData, startCol, startRow);
}

// Render vector annotations as SVG
function VectorAnnotationLayer({
  annotations,
  imageWidth,
  imageHeight,
}: {
  annotations: GraphicAnnotation[];
  imageWidth: number;
  imageHeight: number;
}) {
  if (imageWidth === 0 || imageHeight === 0) return null;

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="none"
    >
      {annotations.map((annotation, index) => (
        <AnnotationShape key={index} annotation={annotation} />
      ))}
    </svg>
  );
}

function AnnotationShape({
  annotation,
}: {
  annotation: GraphicAnnotation;
}) {
  const { graphicType, graphicData, textValue } = annotation;

  // Annotation color
  const strokeColor = '#00ff00';
  const strokeWidth = 2;

  switch (graphicType) {
    case 'POINT': {
      if (graphicData.length < 2) return null;
      const [x, y] = graphicData;
      return (
        <circle
          cx={x}
          cy={y}
          r={4}
          fill={strokeColor}
          stroke="none"
        />
      );
    }

    case 'POLYLINE': {
      if (graphicData.length < 4) return null;
      // Points are stored as x1,y1,x2,y2,...
      const points: string[] = [];
      for (let i = 0; i < graphicData.length; i += 2) {
        points.push(`${graphicData[i]},${graphicData[i + 1]}`);
      }
      return (
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      );
    }

    case 'CIRCLE': {
      // Circle defined by center point and a point on the circle
      if (graphicData.length < 4) return null;
      const [cx, cy, px, py] = graphicData;
      const radius = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      return (
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      );
    }

    case 'ELLIPSE': {
      // Ellipse defined by 4 points: major axis endpoints and minor axis endpoints
      if (graphicData.length < 8) return null;
      const [ax1, ay1, ax2, ay2, bx1, by1, bx2, by2] = graphicData;

      // Calculate center
      const cx = (ax1 + ax2) / 2;
      const cy = (ay1 + ay2) / 2;

      // Calculate radii
      const rx = Math.sqrt((ax2 - ax1) ** 2 + (ay2 - ay1) ** 2) / 2;
      const ry = Math.sqrt((bx2 - bx1) ** 2 + (by2 - by1) ** 2) / 2;

      // Calculate rotation angle
      const rotation = Math.atan2(ay2 - ay1, ax2 - ax1) * (180 / Math.PI);

      return (
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          transform={`rotate(${rotation} ${cx} ${cy})`}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      );
    }

    case 'TEXT': {
      if (graphicData.length < 2 || !textValue) return null;
      const [x, y] = graphicData;
      return (
        <text
          x={x}
          y={y}
          fill={strokeColor}
          fontSize={14}
          fontFamily="sans-serif"
        >
          {textValue}
        </text>
      );
    }

    default:
      return null;
  }
}
