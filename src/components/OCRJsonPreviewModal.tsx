import React from 'react';

export interface OCRJsonPreviewItem {
  fileKey?: string;
  fileName: string;
  text: string;
  ocrJson?: unknown;
  structuredDtr?: unknown;
  structuredMeta?: unknown;
  error?: string;
}

interface OCRJsonPreviewModalProps {
  isOpen: boolean;
  items: OCRJsonPreviewItem[];
  onClose: () => void;
}

const stringifySafe = (value: unknown): string => {
  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const OCRJsonPreviewModal: React.FC<OCRJsonPreviewModalProps> = ({
  isOpen,
  items,
  onClose,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Local OCR JSON preview">
      <div className="ocr-json-modal card">
        <div className="ocr-json-modal-header-row">
          <h3>Local OCR JSON Preview</h3>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="ocr-json-subtitle">
          This shows cached PaddleOCR output from your latest Process DTR attempt.
        </p>

        {items.length === 0 && (
          <p className="ocr-json-empty">No cached OCR data found yet. Click Process DTR first, then open Preview OCR JSON if needed.</p>
        )}

        {items.length > 0 && (
          <div className="ocr-json-list">
            {items.map((item) => (
              <section key={item.fileKey || item.fileName} className="ocr-json-item">
                <div className="ocr-json-item-header">
                  <h4>{item.fileName}</h4>
                  {item.error ? <span className="badge">Failed</span> : <span className="badge">OK</span>}
                </div>

                {item.error ? (
                  <pre className="error-pre">{item.error}</pre>
                ) : (
                  <>
                    <details open>
                      <summary>structured_meta</summary>
                      <pre className="error-pre">{stringifySafe(item.structuredMeta)}</pre>
                    </details>

                    <details>
                      <summary>structured_dtr</summary>
                      <pre className="error-pre">{stringifySafe(item.structuredDtr)}</pre>
                    </details>

                    <details open>
                      <summary>ocr_json</summary>
                      <pre className="error-pre">{stringifySafe(item.ocrJson)}</pre>
                    </details>

                    <details>
                      <summary>ocr_text</summary>
                      <pre className="error-pre">{item.text}</pre>
                    </details>
                  </>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
