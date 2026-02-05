import { useEffect } from 'react';
import { useViewerStore } from './lib/store';
import Dashboard from './components/Dashboard';
import Viewer from './components/Viewer';
import ErrorDisplay from './components/ErrorDisplay';
import LoadingOverlay from './components/LoadingOverlay';
import Onboarding from './components/Onboarding';

function App() {
  const view = useViewerStore((s) => s.view);
  const error = useViewerStore((s) => s.error);
  const isLoading = useViewerStore((s) => s.isLoading);
  const settings = useViewerStore((s) => s.settings);
  const clearStudy = useViewerStore((s) => s.clearStudy);
  const clearError = useViewerStore((s) => s.clearError);
  const updateSettings = useViewerStore((s) => s.updateSettings);

  // Listen for menu actions
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleMenuAction = (action: string) => {
      switch (action) {
        case 'close-study':
          clearStudy();
          break;
        case 'reset-view':
          // Will be handled by Viewer component
          break;
      }
    };

    window.electronAPI.onMenuAction(handleMenuAction);

    return () => {
      window.electronAPI.removeMenuListeners();
    };
  }, [clearStudy]);

  const handleOnboardingComplete = () => {
    updateSettings({ hasSeenOnboarding: true });
  };

  return (
    <div className="h-full flex flex-col bg-viewer-bg text-white">
      {/* Error display */}
      {error && (
        <ErrorDisplay message={error} onDismiss={clearError} />
      )}

      {/* Loading overlay */}
      {isLoading && <LoadingOverlay />}

      {/* Main content */}
      {view === 'dashboard' ? (
        <Dashboard />
      ) : (
        <Viewer />
      )}

      {/* Onboarding for first-time users */}
      {!settings.hasSeenOnboarding && view === 'dashboard' && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}
    </div>
  );
}

export default App;
