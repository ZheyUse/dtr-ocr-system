import React from 'react';
import { ExtractionSummary } from '../types/dtr.types';

interface ExtractionSuccessModalProps {
  isOpen: boolean;
  summary: ExtractionSummary | null;
  onClose: () => void;
}

export const ExtractionSuccessModal: React.FC<ExtractionSuccessModalProps> = ({
  isOpen,
  summary,
  onClose,
}) => {
  if (!isOpen || !summary) {
    return null;
  }

  const modeTitle =
    summary.mode === 'local'
      ? 'Successfully Extracted Using Local OCR + Qwen3'
      : summary.mode === 'free'
      ? 'Successfully Extracted Using OpenRouter'
      : 'Successfully Extracted Using Gemini';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Extraction success details">
      <div className="extraction-success-modal card">
        <div className="success-icon" aria-hidden="true">
          ✓
        </div>
        <h3>{modeTitle}</h3>
        <p className="success-model-label">
          <strong>Model Used:</strong> {summary.primaryModelLabel}
        </p>
        <p className="success-fallback-note">
          {summary.usedFallback
            ? 'Fallback was used for at least one file.'
            : 'Primary model handled all files without fallback.'}
        </p>

        <div className="success-model-list">
          <strong>Per-file model results:</strong>
          <ul>
            {summary.perFile.map((item) => (
              <li key={`${item.fileName}-${item.modelName}-${item.apiVersion}`}>
                <span className="success-file-name">{item.fileName}</span>
                <span>
                  {item.modelName} ({item.apiVersion})
                  {item.usedFallback ? ' - fallback' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <button type="button" className="primary-btn" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
};
