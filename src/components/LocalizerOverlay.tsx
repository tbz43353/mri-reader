import { useEffect, useRef, useState, useCallback } from 'react';
import { useViewerStore } from '../lib/store';
import { getViewport, subscribeToCamera } from '../lib/cornerstone';
import { computeCrossReference, type CrossReferenceResult } from '../lib/crossReference';

interface LocalizerOverlayProps {
  viewportIndex: number;
  viewportId: string;
}

export default function LocalizerOverlay({ viewportIndex, viewportId }: LocalizerOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [crossRef, setCrossRef] = useState<CrossReferenceResult | null>(null);

  const layout = useViewerStore((s) => s.layout);
  const study = useViewerStore((s) => s.study);
  const activeViewportIndex = useViewerStore((s) => s.activeViewportIndex);
  const viewports = useViewerStore((s) => s.viewports);

  // In 1x2: 0 <-> 1. In 2x2: target pairs with active viewport (or slot 0)
  const sourceIndex =
    layout === '1x2'
      ? viewportIndex === 0
        ? 1
        : 0
      : activeViewportIndex !== viewportIndex
      ? activeViewportIndex
      : (viewportIndex + 1) % 4;

  const isSourceActive = activeViewportIndex === sourceIndex;
  const sourceSlot = viewports[sourceIndex];
  const targetSlot = viewports[viewportIndex];

  const sourceSeries = study?.series.find((s) => s.seriesInstanceUID === sourceSlot?.seriesInstanceUID);
  const targetSeries = study?.series.find((s) => s.seriesInstanceUID === targetSlot?.seriesInstanceUID);

  const updateLines = useCallback(() => {
    if (layout === '1x1' || !sourceSeries || !targetSeries) {
      setCrossRef(null);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const targetViewport = getViewport(viewportId);
    if (!targetViewport) return;

    const result = computeCrossReference(
      sourceSeries,
      sourceSlot.sliceIndex,
      targetViewport,
      rect.width,
      rect.height
    );

    setCrossRef(result);
  }, [layout, sourceSeries, targetSeries, sourceSlot?.sliceIndex, viewportId]);

  useEffect(() => {
    const timer = setTimeout(updateLines, 80);
    const unsubscribeCamera = subscribeToCamera(updateLines);
    const handleResize = () => updateLines();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timer);
      unsubscribeCamera();
      window.removeEventListener('resize', handleResize);
    };
  }, [updateLines]);

  if (layout === '1x1' || !crossRef) {
    return <div ref={containerRef} className="absolute inset-0 pointer-events-none" />;
  }

  const { activeLine, slabStartLine, slabEndLine, slabPolygonPoints, hasIntersection, isParallel } = crossRef;

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {hasIntersection && (
        <svg className="w-full h-full pointer-events-none" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <filter id={`scout-glow-${viewportIndex}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#00e5ff" floodOpacity="0.85" />
            </filter>
          </defs>

          {/* Translucent slab coverage */}
          {slabPolygonPoints && (
            <polygon
              points={slabPolygonPoints}
              fill="rgba(56, 189, 248, 0.12)"
              stroke="none"
              className="pointer-events-none"
            />
          )}

          {/* Slab range boundary start line */}
          {slabStartLine && (
            <g className="pointer-events-none">
              <line
                x1={slabStartLine.x1}
                y1={slabStartLine.y1}
                x2={slabStartLine.x2}
                y2={slabStartLine.y2}
                stroke="#0284c7"
                strokeWidth={5}
                opacity={0.3}
              />
              <line
                x1={slabStartLine.x1}
                y1={slabStartLine.y1}
                x2={slabStartLine.x2}
                y2={slabStartLine.y2}
                stroke="#38bdf8"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.9}
              />
            </g>
          )}

          {/* Slab range boundary end line */}
          {slabEndLine && (
            <g className="pointer-events-none">
              <line
                x1={slabEndLine.x1}
                y1={slabEndLine.y1}
                x2={slabEndLine.x2}
                y2={slabEndLine.y2}
                stroke="#0284c7"
                strokeWidth={5}
                opacity={0.3}
              />
              <line
                x1={slabEndLine.x1}
                y1={slabEndLine.y1}
                x2={slabEndLine.x2}
                y2={slabEndLine.y2}
                stroke="#38bdf8"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.9}
              />
            </g>
          )}

          {/* Active observed slice line (dashed line across the image) */}
          {activeLine && (
            <g className="pointer-events-none">
              <line
                x1={activeLine.x1}
                y1={activeLine.y1}
                x2={activeLine.x2}
                y2={activeLine.y2}
                stroke="#000000"
                strokeWidth={5}
                opacity={0.65}
              />
              <line
                x1={activeLine.x1}
                y1={activeLine.y1}
                x2={activeLine.x2}
                y2={activeLine.y2}
                stroke={isSourceActive ? '#00e5ff' : '#38bdf8'}
                strokeWidth={2.2}
                strokeDasharray="7 4"
                filter={`url(#scout-glow-${viewportIndex})`}
              />
              {(() => {
                const midX = (activeLine.x1 + activeLine.x2) / 2;
                const midY = (activeLine.y1 + activeLine.y2) / 2;
                const badgeX = Math.max(
                  30,
                  Math.min(
                    activeLine.x1 + 16,
                    containerRef.current?.clientWidth
                      ? containerRef.current.clientWidth - 70
                      : midX
                  )
                );
                const badgeY = Math.max(
                  20,
                  Math.min(
                    activeLine.y1 - 10,
                    containerRef.current?.clientHeight
                      ? containerRef.current.clientHeight - 20
                      : midY
                  )
                );

                return (
                  <g transform={`translate(${badgeX}, ${badgeY})`}>
                    <rect
                      x={-4}
                      y={-11}
                      width={56}
                      height={16}
                      rx={4}
                      fill="rgba(10, 15, 25, 0.88)"
                      stroke={isSourceActive ? '#00e5ff' : '#38bdf8'}
                      strokeWidth={1}
                    />
                    <text
                      x={24}
                      y={1}
                      textAnchor="middle"
                      fill={isSourceActive ? '#00e5ff' : '#e0f2fe'}
                      fontSize={10}
                      fontWeight="600"
                      fontFamily="monospace"
                    >
                      Sl. {activeLine.sliceIndex + 1}/{activeLine.totalSlices}
                    </text>
                  </g>
                );
              })()}
            </g>
          )}
        </svg>
      )}

      {/* Scout Series Info Pill in Bottom-Right */}
      {hasIntersection && sourceSeries && (
        <div className="absolute bottom-8 right-3 text-[11px] bg-gray-950/85 border border-sky-500/40 text-sky-200 rounded-md px-2.5 py-1 flex items-center gap-2 shadow-lg backdrop-blur-md pointer-events-none">
          <span
            className={`w-2 h-2 rounded-full ${
              isSourceActive ? 'bg-cyan-400 animate-pulse shadow-sm shadow-cyan-400' : 'bg-sky-400'
            }`}
          />
          <span>
            Scout:{' '}
            <strong className="text-white font-medium">
              {sourceSeries.seriesDescription || 'Cross-Section'}
            </strong>{' '}
            <span className="text-cyan-400 font-mono font-semibold">
              Sl. {sourceSlot.sliceIndex + 1}/{sourceSeries.images.length}
            </span>
          </span>
        </div>
      )}

      {isParallel && (
        <div className="absolute bottom-8 right-3 text-[11px] bg-gray-900/80 border border-gray-700/60 text-gray-400 rounded-md px-2 py-0.5 pointer-events-none">
          Parallel series (no cross-section)
        </div>
      )}
    </div>
  );
}
