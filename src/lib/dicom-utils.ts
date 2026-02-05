/**
 * Shared DICOM parsing utilities
 */

/**
 * Format DICOM date (YYYYMMDD) to human-readable format (YYYY-MM-DD)
 */
export function formatDicomDate(dateStr: string | undefined): string {
  if (!dateStr || dateStr.length !== 8) return 'Unknown Date';
  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);
  return `${year}-${month}-${day}`;
}
