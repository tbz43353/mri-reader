import { useEffect, useRef, useState, useCallback } from 'react';
import { useViewerStore, useCurrentSeries, useCurrentImage } from '../lib/store';
import {
  canvasToImageCoords,
  imageToCanvasCoords,
  getPixelValueAt,
  getROIStats,
  subscribeToCamera,
} from '../lib/cornerstone';

interface MeasurementOverlayProps {
  viewportIndex: number;
  viewportId: string;
}

export default function MeasurementOverlay({ viewportIndex, viewportId }: MeasurementOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [, setTransformTick] = useState(0);

  const activeTool = useViewerStore((s) => s.activeTool);
  const activeViewportIndex = useViewerStore((s) => s.activeViewportIndex);
  const measurements = useViewerStore((s) => s.measurements);
  const addMeasurement = useViewerStore((s) => s.addMeasurement);
  const removeMeasurement = useViewerStore((s) => s.removeMeasurement);

  const currentSeries = useCurrentSeries(viewportIndex);
  const currentImage = useCurrentImage(viewportIndex);
  const slot = useViewerStore((s) => s.viewports[viewportIndex]);
  const currentSliceIndex = slot?.sliceIndex ?? 0;

  const isCurrentActive = activeViewportIndex === viewportIndex;

  // Drawing state
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [probeInfo, setProbeInfo] = useState<{ x: number; y: number; val: number; canvasX: number; canvasY: number } | null>(null);

  const imageWidth = currentImage?.columns ?? 512;
  const imageHeight = currentImage?.rows ?? 512;

  const updateTransform = useCallback(() => {
    setTransformTick((t) => t + 1);
  }, []);

  useEffect(() => {
    const timer = setTimeout(updateTransform, 40);
    const unsubscribe = subscribeToCamera(updateTransform);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [updateTransform]);

  // Pixel spacing in mm (col, row)
  const colSpacing = currentImage?.pixelSpacing?.[1] ?? 1.0;
  const rowSpacing = currentImage?.pixelSpacing?.[0] ?? 1.0;

  // Handle keyboard Delete for selected measurement
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        removeMeasurement(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, removeMeasurement]);

  if (!currentSeries || !currentImage) return null;

  // Filter measurements for this series and slice
  const sliceMeasurements = measurements.filter(
    (m) =>
      m.seriesInstanceUID === currentSeries.seriesInstanceUID &&
      m.sliceIndex === currentSliceIndex
  );

  const getCanvasMousePos = (e: React.MouseEvent): [number, number] | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'pan' || !isCurrentActive || e.button !== 0) return;

    const canvasPos = getCanvasMousePos(e);
    if (!canvasPos) return;

    const imgPos = canvasToImageCoords(canvasPos, imageWidth, imageHeight, viewportId);
    if (!imgPos) return;

    if (activeTool === 'length' || activeTool === 'rectangle' || activeTool === 'ellipse') {
      setDrawingPoints([imgPos, imgPos]);
    } else if (activeTool === 'angle') {
      if (drawingPoints.length === 0) {
        setDrawingPoints([imgPos, imgPos]);
      } else if (drawingPoints.length === 2) {
        setDrawingPoints([...drawingPoints, imgPos]);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvasPos = getCanvasMousePos(e);
    if (!canvasPos) return;

    // Handle probe tool
    if (activeTool === 'probe' && isCurrentActive) {
      const imgPos = canvasToImageCoords(canvasPos, imageWidth, imageHeight, viewportId);
      if (imgPos) {
        const val = getPixelValueAt(imgPos, viewportId);
        if (val !== null) {
          setProbeInfo({
            x: Math.round(imgPos[0]),
            y: Math.round(imgPos[1]),
            val,
            canvasX: canvasPos[0],
            canvasY: canvasPos[1],
          });
        } else {
          setProbeInfo(null);
        }
      }
      return;
    }

    if (drawingPoints.length === 0) return;

    const imgPos = canvasToImageCoords(canvasPos, imageWidth, imageHeight, viewportId);
    if (!imgPos) return;

    if (activeTool === 'length' || activeTool === 'rectangle' || activeTool === 'ellipse') {
      setDrawingPoints([drawingPoints[0], imgPos]);
    } else if (activeTool === 'angle') {
      if (drawingPoints.length === 2) {
        setDrawingPoints([drawingPoints[0], imgPos]);
      } else if (drawingPoints.length === 3) {
        setDrawingPoints([drawingPoints[0], drawingPoints[1], imgPos]);
      }
    }
  };

  const handleMouseUp = () => {
    if (drawingPoints.length === 0) return;

    if (activeTool === 'length' && drawingPoints.length >= 2) {
      const [p1, p2] = drawingPoints;
      const dx = (p2[0] - p1[0]) * colSpacing;
      const dy = (p2[1] - p1[1]) * rowSpacing;
      const dist = Math.hypot(dx, dy);

      if (dist > 1.5) {
        addMeasurement({
          id: `m-${Date.now()}`,
          type: 'length',
          viewportId,
          seriesInstanceUID: currentSeries.seriesInstanceUID,
          sliceIndex: currentSliceIndex,
          imagePoints: [p1, p2],
          value: Math.round(dist * 10) / 10,
          unit: 'mm',
        });
      }
      setDrawingPoints([]);
    } else if (activeTool === 'rectangle' && drawingPoints.length >= 2) {
      const [p1, p2] = drawingPoints;
      const widthMm = Math.abs(p2[0] - p1[0]) * colSpacing;
      const heightMm = Math.abs(p2[1] - p1[1]) * rowSpacing;
      const areaCm2 = (widthMm * heightMm) / 100;

      if (areaCm2 > 0.05) {
        const box = {
          xMin: Math.min(p1[0], p2[0]),
          xMax: Math.max(p1[0], p2[0]),
          yMin: Math.min(p1[1], p2[1]),
          yMax: Math.max(p1[1], p2[1]),
        };
        const stats = getROIStats(box, viewportId) || undefined;

        addMeasurement({
          id: `m-${Date.now()}`,
          type: 'rectangle',
          viewportId,
          seriesInstanceUID: currentSeries.seriesInstanceUID,
          sliceIndex: currentSliceIndex,
          imagePoints: [p1, p2],
          value: Math.round(areaCm2 * 100) / 100,
          unit: 'cm²',
          stats,
        });
      }
      setDrawingPoints([]);
    } else if (activeTool === 'ellipse' && drawingPoints.length >= 2) {
      const [p1, p2] = drawingPoints;
      const widthMm = Math.abs(p2[0] - p1[0]) * colSpacing;
      const heightMm = Math.abs(p2[1] - p1[1]) * rowSpacing;
      const areaCm2 = (Math.PI * (widthMm / 2) * (heightMm / 2)) / 100;

      if (areaCm2 > 0.05) {
        const box = {
          xMin: Math.min(p1[0], p2[0]),
          xMax: Math.max(p1[0], p2[0]),
          yMin: Math.min(p1[1], p2[1]),
          yMax: Math.max(p1[1], p2[1]),
        };
        const stats = getROIStats(box, viewportId) || undefined;

        addMeasurement({
          id: `m-${Date.now()}`,
          type: 'ellipse',
          viewportId,
          seriesInstanceUID: currentSeries.seriesInstanceUID,
          sliceIndex: currentSliceIndex,
          imagePoints: [p1, p2],
          value: Math.round(areaCm2 * 100) / 100,
          unit: 'cm²',
          stats,
        });
      }
      setDrawingPoints([]);
    } else if (activeTool === 'angle') {
      if (drawingPoints.length === 3) {
        const [p1, p2, p3] = drawingPoints;
        const v1x = (p1[0] - p2[0]) * colSpacing;
        const v1y = (p1[1] - p2[1]) * rowSpacing;
        const v2x = (p3[0] - p2[0]) * colSpacing;
        const v2y = (p3[1] - p2[1]) * rowSpacing;

        const dot = v1x * v2x + v1y * v2y;
        const mag1 = Math.hypot(v1x, v1y);
        const mag2 = Math.hypot(v2x, v2y);

        if (mag1 > 2 && mag2 > 2) {
          const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
          const angleDeg = Math.round(Math.acos(cosTheta) * (180 / Math.PI) * 10) / 10;

          addMeasurement({
            id: `m-${Date.now()}`,
            type: 'angle',
            viewportId,
            seriesInstanceUID: currentSeries.seriesInstanceUID,
            sliceIndex: currentSliceIndex,
            imagePoints: [p1, p2, p3],
            value: angleDeg,
            unit: '°',
          });
        }
        setDrawingPoints([]);
      }
    }
  };

  const toCanvas = (imgPt: [number, number]): [number, number] => {
    return imageToCanvasCoords(imgPt, imageWidth, imageHeight, viewportId) || [0, 0];
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={`absolute inset-0 z-20 ${
        activeTool !== 'pan' ? 'cursor-crosshair pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <svg className="w-full h-full" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id={`meas-shadow-${viewportIndex}`}>
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Existing Measurements on this slice */}
        {sliceMeasurements.map((m) => {
          const isSelected = selectedId === m.id;
          const strokeColor = isSelected ? '#38bdf8' : '#22c55e';

          if (m.type === 'length' && m.imagePoints.length >= 2) {
            const p1 = toCanvas(m.imagePoints[0]);
            const p2 = toCanvas(m.imagePoints[1]);
            const midX = (p1[0] + p2[0]) / 2;
            const midY = (p1[1] + p2[1]) / 2;

            return (
              <g
                key={m.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(m.id);
                }}
                className="cursor-pointer pointer-events-auto"
              >
                {/* Measurement Line */}
                <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke="#000" strokeWidth={3.5} opacity={0.6} />
                <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={strokeColor} strokeWidth={2} />

                {/* Caliper Endpoints */}
                <circle cx={p1[0]} cy={p1[1]} r={3.5} fill={strokeColor} stroke="#000" strokeWidth={1} />
                <circle cx={p2[0]} cy={p2[1]} r={3.5} fill={strokeColor} stroke="#000" strokeWidth={1} />

                {/* Label badge */}
                <g transform={`translate(${midX + 8}, ${midY - 8})`}>
                  <rect x={-4} y={-11} width={62} height={16} rx={3} fill="rgba(10,15,25,0.85)" stroke={strokeColor} strokeWidth={1} />
                  <text x={27} y={1} textAnchor="middle" fill="#fff" fontSize={10} fontWeight="bold" fontFamily="monospace">
                    {m.value} {m.unit}
                  </text>
                </g>
              </g>
            );
          }

          if (m.type === 'rectangle' && m.imagePoints.length >= 2) {
            const p1 = toCanvas(m.imagePoints[0]);
            const p2 = toCanvas(m.imagePoints[1]);
            const x = Math.min(p1[0], p2[0]);
            const y = Math.min(p1[1], p2[1]);
            const w = Math.abs(p2[0] - p1[0]);
            const h = Math.abs(p2[1] - p1[1]);

            return (
              <g
                key={m.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(m.id);
                }}
                className="cursor-pointer pointer-events-auto"
              >
                <rect x={x} y={y} width={w} height={h} fill="rgba(34, 197, 94, 0.08)" stroke={strokeColor} strokeWidth={1.8} strokeDasharray="4 2" />
                <g transform={`translate(${x + 4}, ${y + h + 14})`}>
                  <rect x={-2} y={-11} width={80} height={m.stats ? 28 : 16} rx={3} fill="rgba(10,15,25,0.85)" stroke={strokeColor} strokeWidth={1} />
                  <text x={38} y={-1} textAnchor="middle" fill="#fff" fontSize={9.5} fontWeight="bold" fontFamily="monospace">
                    {m.value} {m.unit}
                  </text>
                  {m.stats && (
                    <text x={38} y={11} textAnchor="middle" fill="#93c5fd" fontSize={8} fontFamily="monospace">
                      Mean: {m.stats.mean}
                    </text>
                  )}
                </g>
              </g>
            );
          }

          if (m.type === 'ellipse' && m.imagePoints.length >= 2) {
            const p1 = toCanvas(m.imagePoints[0]);
            const p2 = toCanvas(m.imagePoints[1]);
            const cx = (p1[0] + p2[0]) / 2;
            const cy = (p1[1] + p2[1]) / 2;
            const rx = Math.abs(p2[0] - p1[0]) / 2;
            const ry = Math.abs(p2[1] - p1[1]) / 2;

            return (
              <g
                key={m.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(m.id);
                }}
                className="cursor-pointer pointer-events-auto"
              >
                <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="rgba(34, 197, 94, 0.08)" stroke={strokeColor} strokeWidth={1.8} strokeDasharray="4 2" />
                <g transform={`translate(${cx - 40}, ${cy + ry + 14})`}>
                  <rect x={-2} y={-11} width={80} height={m.stats ? 28 : 16} rx={3} fill="rgba(10,15,25,0.85)" stroke={strokeColor} strokeWidth={1} />
                  <text x={38} y={-1} textAnchor="middle" fill="#fff" fontSize={9.5} fontWeight="bold" fontFamily="monospace">
                    {m.value} {m.unit}
                  </text>
                  {m.stats && (
                    <text x={38} y={11} textAnchor="middle" fill="#93c5fd" fontSize={8} fontFamily="monospace">
                      Mean: {m.stats.mean}
                    </text>
                  )}
                </g>
              </g>
            );
          }

          if (m.type === 'angle' && m.imagePoints.length === 3) {
            const p1 = toCanvas(m.imagePoints[0]);
            const p2 = toCanvas(m.imagePoints[1]);
            const p3 = toCanvas(m.imagePoints[2]);

            return (
              <g
                key={m.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(m.id);
                }}
                className="cursor-pointer pointer-events-auto"
              >
                <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={strokeColor} strokeWidth={2} />
                <line x1={p2[0]} y1={p2[1]} x2={p3[0]} y2={p3[1]} stroke={strokeColor} strokeWidth={2} />
                <circle cx={p2[0]} cy={p2[1]} r={3} fill={strokeColor} />
                <g transform={`translate(${p2[0] + 8}, ${p2[1] - 8})`}>
                  <rect x={-4} y={-11} width={50} height={16} rx={3} fill="rgba(10,15,25,0.85)" stroke={strokeColor} strokeWidth={1} />
                  <text x={21} y={1} textAnchor="middle" fill="#fff" fontSize={10} fontWeight="bold" fontFamily="monospace">
                    {m.value} {m.unit}
                  </text>
                </g>
              </g>
            );
          }

          return null;
        })}

        {/* Live Drawing Preview */}
        {drawingPoints.length >= 2 && (
          <g>
            {activeTool === 'length' && (
              <>
                <line
                  x1={toCanvas(drawingPoints[0])[0]}
                  y1={toCanvas(drawingPoints[0])[1]}
                  x2={toCanvas(drawingPoints[1])[0]}
                  y2={toCanvas(drawingPoints[1])[1]}
                  stroke="#38bdf8"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                />
                <circle cx={toCanvas(drawingPoints[0])[0]} cy={toCanvas(drawingPoints[0])[1]} r={3.5} fill="#38bdf8" />
                <circle cx={toCanvas(drawingPoints[1])[0]} cy={toCanvas(drawingPoints[1])[1]} r={3.5} fill="#38bdf8" />
              </>
            )}

            {activeTool === 'rectangle' && (() => {
              const p1 = toCanvas(drawingPoints[0]);
              const p2 = toCanvas(drawingPoints[1]);
              return (
                <rect
                  x={Math.min(p1[0], p2[0])}
                  y={Math.min(p1[1], p2[1])}
                  width={Math.abs(p2[0] - p1[0])}
                  height={Math.abs(p2[1] - p1[1])}
                  fill="rgba(56, 189, 248, 0.12)"
                  stroke="#38bdf8"
                  strokeWidth={1.8}
                  strokeDasharray="4 2"
                />
              );
            })()}

            {activeTool === 'ellipse' && (() => {
              const p1 = toCanvas(drawingPoints[0]);
              const p2 = toCanvas(drawingPoints[1]);
              return (
                <ellipse
                  cx={(p1[0] + p2[0]) / 2}
                  cy={(p1[1] + p2[1]) / 2}
                  rx={Math.abs(p2[0] - p1[0]) / 2}
                  ry={Math.abs(p2[1] - p1[1]) / 2}
                  fill="rgba(56, 189, 248, 0.12)"
                  stroke="#38bdf8"
                  strokeWidth={1.8}
                  strokeDasharray="4 2"
                />
              );
            })()}

            {activeTool === 'angle' && (
              <>
                <line
                  x1={toCanvas(drawingPoints[0])[0]}
                  y1={toCanvas(drawingPoints[0])[1]}
                  x2={toCanvas(drawingPoints[1])[0]}
                  y2={toCanvas(drawingPoints[1])[1]}
                  stroke="#38bdf8"
                  strokeWidth={2}
                />
                {drawingPoints.length === 3 && (
                  <line
                    x1={toCanvas(drawingPoints[1])[0]}
                    y1={toCanvas(drawingPoints[1])[1]}
                    x2={toCanvas(drawingPoints[2])[0]}
                    y2={toCanvas(drawingPoints[2])[1]}
                    stroke="#38bdf8"
                    strokeWidth={2}
                  />
                )}
              </>
            )}
          </g>
        )}
      </svg>

      {/* Live Probe Hover Badge */}
      {probeInfo && activeTool === 'probe' && (
        <div
          className="absolute pointer-events-none text-[11px] font-mono bg-gray-950/90 text-white px-2 py-1 rounded border border-cyan-400 shadow-xl"
          style={{
            left: probeInfo.canvasX + 14,
            top: probeInfo.canvasY + 14,
          }}
        >
          <div>Pos: [{probeInfo.x}, {probeInfo.y}]</div>
          <div className="text-cyan-300 font-bold">Signal: {probeInfo.val}</div>
        </div>
      )}
    </div>
  );
}
