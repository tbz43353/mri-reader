import { useState } from 'react';
import { useStudyReports, useHasReports, useViewerStore } from '../lib/store';
import type { DicomReport, ReportFinding } from '../types';

export default function ReportPanel() {
  const [isExpanded, setIsExpanded] = useState(true);
  const reports = useStudyReports();
  const hasReports = useHasReports();
  const settings = useViewerStore((s) => s.settings);

  if (!hasReports) return null;

  return (
    <div className="bg-panel-bg border-t border-gray-700">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="text-white font-medium">
            {settings.expertMode ? 'Structured Reports' : 'Radiology Report'}
          </span>
          <span className="text-gray-500 text-sm">({reports.length})</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 pt-0 space-y-4 max-h-64 overflow-y-auto">
          {reports.map((report, index) => (
            <ReportContent key={report.sopInstanceUID} report={report} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportContent({ report, index }: { report: DicomReport; index: number }) {
  const settings = useViewerStore((s) => s.settings);
  const [isOpen, setIsOpen] = useState(index === 0); // First report expanded by default

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2 flex items-center justify-between text-left bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-white text-sm">
            {settings.expertMode
              ? `Report ${index + 1}`
              : index === 0
                ? 'Report'
                : `Additional Report ${index}`}
          </span>
          {settings.expertMode && report.contentDate && (
            <span className="text-gray-500 text-xs">{report.contentDate}</span>
          )}
          {settings.expertMode && (
            <span
              className={`px-1.5 py-0.5 text-xs rounded ${
                report.verificationFlag === 'VERIFIED'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}
            >
              {report.verificationFlag}
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="p-3 space-y-2">
          {report.findings.length === 0 ? (
            <p className="text-gray-500 text-sm italic">No findings recorded</p>
          ) : (
            report.findings.map((finding, i) => (
              <FindingItem key={i} finding={finding} depth={0} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FindingItem({ finding, depth }: { finding: ReportFinding; depth: number }) {
  const settings = useViewerStore((s) => s.settings);
  const [isExpanded, setIsExpanded] = useState(depth < 2); // Expand first 2 levels

  const hasChildren = finding.children && finding.children.length > 0;
  const isContainer = finding.valueType === 'CONTAINER';
  const indent = depth * 12;

  // Format display value
  let displayValue = finding.value;
  if (finding.valueType === 'NUM' && finding.unit) {
    displayValue = `${finding.value} ${finding.unit}`;
  }

  // For containers, show as section headers
  if (isContainer) {
    return (
      <div style={{ marginLeft: indent }}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-left w-full"
        >
          {hasChildren && (
            <svg
              className={`w-3 h-3 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          <span className="text-gray-400 text-xs uppercase tracking-wider font-medium">
            {finding.conceptName}
          </span>
        </button>
        {isExpanded && hasChildren && (
          <div className="mt-1">
            {finding.children!.map((child, i) => (
              <FindingItem key={i} finding={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // For text, numeric, and code values
  return (
    <div style={{ marginLeft: indent }} className="py-0.5">
      <div className="flex gap-2">
        {finding.conceptName && (
          <span className="text-gray-500 text-sm shrink-0">{finding.conceptName}:</span>
        )}
        <span
          className={`text-sm ${
            finding.valueType === 'NUM' ? 'text-blue-400 font-mono' : 'text-white'
          }`}
        >
          {displayValue}
        </span>
        {settings.expertMode && finding.referencedImageUID && (
          <span className="text-xs text-accent" title={finding.referencedImageUID}>
            [image ref]
          </span>
        )}
      </div>
      {hasChildren && (
        <div className="mt-1">
          {finding.children!.map((child, i) => (
            <FindingItem key={i} finding={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
