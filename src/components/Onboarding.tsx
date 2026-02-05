import { useState } from 'react';

interface OnboardingProps {
  onComplete: () => void;
}

interface OnboardingStep {
  title: string;
  description: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Welcome to MRI Reader',
    description: 'View your medical images privately on your computer. No internet connection required - all your data stays on your machine.',
  },
  {
    title: 'Open Your Scans',
    description: 'Drag and drop a folder or ZIP file from your imaging facility (like Prenuvo), or click the buttons to browse.',
  },
  {
    title: 'Browse Through Images',
    description: 'Use your scroll wheel or the slider at the bottom to move through the scan slices - like flipping through pages in a book.',
  },
  {
    title: 'Adjust the View',
    description: 'Click and drag on the image to adjust brightness and contrast. Right-click and drag to zoom in on details.',
  },
  {
    title: 'Switch Scan Sequences',
    description: 'Click different items in the sidebar to view other parts of your scan. Each represents a different type of image.',
  },
];

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;
  const step = ONBOARDING_STEPS[currentStep];

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-panel-bg rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
        {/* Step indicator */}
        <div className="flex justify-center gap-2 mb-6">
          {ONBOARDING_STEPS.map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === currentStep
                  ? 'w-6 bg-accent'
                  : index < currentStep
                  ? 'w-3 bg-accent/50'
                  : 'w-3 bg-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="text-center mb-8">
          {/* Icon for first step */}
          {currentStep === 0 && (
            <div className="mb-6">
              <svg
                className="w-16 h-16 mx-auto text-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          )}

          <h2 className="text-2xl font-semibold text-white mb-4">{step.title}</h2>
          <p className="text-gray-300 leading-relaxed">{step.description}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="flex-1 py-3 px-4 text-gray-400 hover:text-white transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            className="flex-1 py-3 px-4 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors"
          >
            {isLastStep ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
