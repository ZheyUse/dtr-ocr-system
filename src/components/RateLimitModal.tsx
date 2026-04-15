import React from 'react';

interface RateLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  debug?: any;
}

export const RateLimitModal: React.FC<RateLimitModalProps> = ({ isOpen, onClose, debug }) => {
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

        {debug && (
          <div className="rate-limit-debug">
            <h4>Debug details</h4>
            <p>
              <strong>File:</strong> {debug.fileName ?? 'unknown'}
            </p>
            <p>
              <strong>Timestamp:</strong> {debug.timestamp ? new Date(debug.timestamp).toLocaleString() : 'n/a'}
            </p>
            <div className="attempts-list">
              <strong>Attempts:</strong>
              <ul>
                {(debug.attempts || []).map((a: any, idx: number) => (
                  <li key={idx} className="attempt-item">
                    <div>
                      <strong>{a.modelName}</strong> ({a.apiVersion}) — status: {a.status ?? 'n/a'}
                    </div>
                    <div className="attempt-flags">
                      {a.isRateLimit ? <span className="badge">RateLimit</span> : null}
                      {a.isModelNotFound ? <span className="badge">ModelNotFound</span> : null}
                    </div>
                    <pre className="error-pre">{JSON.stringify(a.serializedError ?? a, null, 2)}</pre>
                  </li>
                ))}
              </ul>
            </div>
            {debug.finalError && (
              <div className="final-error">
                <strong>Final error:</strong>
                <pre className="error-pre">{JSON.stringify(debug.finalError, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
