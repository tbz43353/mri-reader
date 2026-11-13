import { useEffect, useState } from 'react';
import { useViewerStore, useCurrentSeries, useCurrentImage } from '../lib/store';
import { getViewport } from '../lib/cornerstone';
import { getAnatomicalOrientation, type ViewportOrientationLabels } from '../lib/orientation';

interface CornerOverlaysProps {
  viewportIndex: number;
  viewportId: string;
}

export default function CornerOverlays({ viewportIndex, viewportId }: CornerOverlaysProps) {
  const study = useViewerStore((s) => s.study);
  const slot = useViewerStore((s) => s.viewports[viewportIndex]);
  const showCornerOverlays = useViewerStore((s) => s.showCornerOverlays);
  const showOrientationMarkers = useViewerStore((s) => s.showOrientationMarkers);

  const currentSeries = useCurrentSeries(viewportIndex);
  const currentImage = useCurrentImage(viewportIndex);
  const currentSliceIndex = slot?.sliceIndex ?? 0;

  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [voiText, setVoiText] = useState<{ wc: number; ww: number } | null>(null);

  useEffect(() => {
    const updateViewportInfo = () => {
      const viewport = getViewport(viewportId);
      if (!viewport) return;

      const zoom = viewport.getZoom?.() ?? 1;
      setZoomPercent(Math.round(zoom * 100));

      const props = viewport.getProperties?.();
      if (props?.voiRange) {
        const { lower, upper } = props.voiRange;
        const ww = Math.round(upper - lower);
        const wc = Math.round((lower + upper) / 2);
        setVoiText({ wc, ww });
      }
    };

    updateViewportInfo();
    const interval = setInterval(updateViewportInfo, 400);
    return () => clearInterval(interval);
  }, [viewportId, currentImage?.sopInstanceUID]);

  if (!study || !currentSeries || !currentImage) return null;

  const orientation: ViewportOrientationLabels | null = getAnatomicalOrientation(
    currentImage.imageOrientationPatient
  );

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-15 overflow-hidden text-[11px] font-mono leading-tight">
      {/* Anatomical Orientation Markers (A, P, L, R, S, I) */}
      {showOrientationMarkers && orientation && (
        <>
          {orientation.top && (
            <div className="absolute top-10 left-1/2 -translate-x-1/2 text-cyan-400 font-bold text-xs tracking-wider bg-black/40 px-1.5 py-0.2 rounded border border-cyan-500/20 shadow">
              {orientation.top}
            </div>
          )}
          {orientation.bottom && (
            <div className="absolute bottom-9 left-1/2 -translate-x-1/2 text-cyan-400 font-bold text-xs tracking-wider bg-black/40 px-1.5 py-0.2 rounded border border-cyan-500/20 shadow">
              {orientation.bottom}
            </div>
          )}
          {orientation.left && (
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-cyan-400 font-bold text-xs tracking-wider bg-black/40 px-1.5 py-0.2 rounded border border-cyan-500/20 shadow">
              {orientation.left}
            </div>
          )}
          {orientation.right && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cyan-400 font-bold text-xs tracking-wider bg-black/40 px-1.5 py-0.2 rounded border border-cyan-500/20 shadow">
              {orientation.right}
            </div>
          )}
        </>
      )}

      {/* 4-Corner Overlays */}
      {showCornerOverlays && (
        <>
          {/* Top-Left: Patient & Acquisition */}
          <div className="absolute top-11 left-2.5 text-white/90 drop-shadow-md space-y-0.5 max-w-[200px]">
            <div className="font-semibold text-white truncate text-xs" title={study.patientName}>
              {study.patientName}
            </div>
            {study.patientId && <div className="text-gray-400 truncate">ID: {study.patientId}</div>}
            <div className="text-gray-400">
              {currentSeries.modality || study.modality || 'MR'} {currentSeries.bodyPart ? `• ${currentSeries.bodyPart}` : ''}
            </div>
          </div>

          {/* Top-Right: Study & Series info */}
          <div className="absolute top-2.5 right-2.5 text-right text-white/90 drop-shadow-md space-y-0.5 max-w-[220px]">
            <div className="text-gray-300 font-medium truncate" title={study.studyDate}>
              {study.studyDate}
            </div>
            <div className="text-gray-400 truncate text-[10px]" title={currentSeries.seriesDescription}>
              {currentSeries.seriesDescription || 'Series'}
            </div>
            <div className="text-gray-400">
              Se: {currentSeries.seriesNumber || 1} • Im: {currentSliceIndex + 1}/{currentSeries.images.length}
            </div>
          </div>

          {/* Bottom-Left: Display parameters (Window/Level, Zoom, Thickness) */}
          <div className="absolute bottom-2.5 left-2.5 text-white/90 drop-shadow-md space-y-0.5">
            {voiText ? (
              <div className="text-sky-300">
                W: {voiText.ww} L: {voiText.wc}
              </div>
            ) : currentImage.windowWidth && currentImage.windowCenter ? (
              <div className="text-sky-300">
                W: {Math.round(currentImage.windowWidth)} L: {Math.round(currentImage.windowCenter)}
              </div>
            ) : null}
            <div className="text-gray-400">
              Zoom: {zoomPercent}%
              {currentImage.sliceThickness ? ` • Thk: ${currentImage.sliceThickness.toFixed(1)}mm` : ''}
            </div>
            {currentImage.sliceLocation !== undefined && (
              <div className="text-gray-500">Loc: {currentImage.sliceLocation.toFixed(1)}mm</div>
            )}
          </div>

          {/* Bottom-Right: Matrix & Spacing */}
          <div className="absolute bottom-2.5 right-2.5 text-right text-white/90 drop-shadow-md space-y-0.5">
            <div className="text-gray-400">
              {currentImage.columns} × {currentImage.rows}
            </div>
            {currentImage.pixelSpacing && (
              <div className="text-gray-400 text-[10px]">
                {currentImage.pixelSpacing[0].toFixed(2)} × {currentImage.pixelSpacing[1].toFixed(2)} mm
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
