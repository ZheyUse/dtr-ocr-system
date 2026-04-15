import React from 'react';

interface ExportFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFormat: (format: 'pdf' | 'excel') => void;
}

export const ExportFormatModal: React.FC<ExportFormatModalProps> = ({
  isOpen,
  onClose,
  onSelectFormat,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Choose export format">
      <div className="export-modal card">
        <h3>Export Report</h3>
        <p>Select your export format.</p>

        <div className="export-modal-actions">
          <button type="button" className="primary-btn" onClick={() => onSelectFormat('pdf')}>
            Export as PDF
          </button>
          <button type="button" className="ghost-btn" onClick={() => onSelectFormat('excel')}>
            Export as Excel
          </button>
        </div>

        <button type="button" className="ghost-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
};
