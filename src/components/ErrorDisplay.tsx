interface ErrorDisplayProps {
  message: string;
  onDismiss: () => void;
}

// User-friendly error message mapping
const USER_FRIENDLY_ERRORS: Record<string, string> = {
  'DICOM parse timeout': "This file is taking too long to open. It may be corrupted or in an unsupported format.",
  'File exceeds maximum allowed size': "This file is too large to open. Try opening a smaller scan.",
  'Invalid DICOM file format': "This doesn't appear to be a medical image file. Make sure you're opening files from your imaging facility.",
  'Access denied': "The app couldn't access this file. Try dragging and dropping the folder instead.",
  'ENOENT': "The file couldn't be found. It may have been moved or deleted.",
  'No DICOM files found': "No medical image files were found in this location. Make sure you've selected the correct folder or ZIP file.",
};

function getUserFriendlyError(error: string): string {
  for (const [key, message] of Object.entries(USER_FRIENDLY_ERRORS)) {
    if (error.includes(key)) return message;
  }
  return error;
}

export default function ErrorDisplay({ message, onDismiss }: ErrorDisplayProps) {
  const friendlyMessage = getUserFriendlyError(message);

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md w-full mx-4">
      <div className="bg-red-900/90 border border-red-700 rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          {/* Error icon */}
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          {/* Message */}
          <div className="flex-1">
            <p className="text-white text-sm">{friendlyMessage}</p>
          </div>

          {/* Dismiss button */}
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-red-400 hover:text-white transition-colors"
            aria-label="Dismiss error"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
