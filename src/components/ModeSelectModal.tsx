import React from 'react';
import { ProcessingMode } from '../types/dtr.types';

interface ModeSelectModalProps {
  isOpen: boolean;
  selectedMode: ProcessingMode;
  onSelectMode: (mode: ProcessingMode) => void;
  onClose: () => void;
}

const modeDescriptions: Record<ProcessingMode, { title: string; subtitle: string; details: string[] }> = {
  local: {
    title: 'Local Mode (Recommended)',
    subtitle: 'PaddleOCR + Qwen3 reasoning',
    details: ['Highest accuracy', 'No API limits for OCR', 'Requires local Python server'],
  },
  free: {
    title: 'Free Mode',
    subtitle: 'OpenRouter AI fallback chain',
    details: ['No local setup required', 'May hit rate limits', 'Uses free cloud models'],
  },
  legacy: {
    title: 'Legacy Mode',
    subtitle: 'Gemini compatibility mode',
    details: ['Existing Gemini workflow', 'Backward compatible', 'May hit quota limits'],
  },
};

export const ModeSelectModal: React.FC<ModeSelectModalProps> = ({
  isOpen,
  selectedMode,
  onSelectMode,
  onClose,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Select processing mode">
      <div className="mode-select-modal card">
        <h3>Select Processing Mode</h3>
        <p>Choose how DTR files should be processed.</p>

        <div className="mode-option-list">
          {(Object.keys(modeDescriptions) as ProcessingMode[]).map((mode) => {
            const details = modeDescriptions[mode];
            const isSelected = selectedMode === mode;

            return (
              <button
                key={mode}
                type="button"
                className={`mode-option-btn ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelectMode(mode)}
              >
                <strong>{details.title}</strong>
                <span>{details.subtitle}</span>
                <small>{details.details.join(' • ')}</small>
              </button>
            );
          })}
        </div>

        <button type="button" className="primary-btn" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
};
