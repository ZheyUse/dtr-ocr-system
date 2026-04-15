import React from 'react';

interface RateLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RateLimitModal: React.FC<RateLimitModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Rate limit reached">
      <div className="rate-limit-modal card">
        <div className="rate-limit-icon" aria-hidden="true">
          !
        </div>
        <h3>Daily Limit Reached</h3>
        <p>
          You&apos;ve reached Gemini&apos;s free usage limit for today. Please come back tomorrow to continue
          processing your DTR.
        </p>
        <button type="button" className="primary-btn" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
};
