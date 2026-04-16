import React from 'react';

interface LocalOCRUnavailableModalProps {
  isOpen: boolean;
  endpoint: string;
  onRetry: () => void;
  onSwitchToFree: () => void;
  onSwitchToLegacy: () => void;
  onClose: () => void;
}

export const LocalOCRUnavailableModal: React.FC<LocalOCRUnavailableModalProps> = ({
  isOpen,
  endpoint,
  onRetry,
  onSwitchToFree,
  onSwitchToLegacy,
  onClose,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Local OCR server unavailable">
      <div className="local-ocr-modal card">
        <h3>Local OCR Server Not Detected</h3>
        <p>To enable Local Mode:</p>

        <ol>
          <li>Install dependencies: <code>pip install paddleocr fastapi uvicorn opencv-python numpy</code></li>
          <li>Start server: <code>python ocr_server.py</code></li>
          <li>Expected endpoint: <code>{endpoint}</code></li>
        </ol>

        <div className="local-ocr-actions">
          <button type="button" className="primary-btn" onClick={onRetry}>
            Retry
          </button>
          <button type="button" className="ghost-btn" onClick={onSwitchToFree}>
            Switch to Free Mode
          </button>
          <button type="button" className="ghost-btn" onClick={onSwitchToLegacy}>
            Switch to Legacy Mode
          </button>
        </div>

        <button type="button" className="ghost-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
};
