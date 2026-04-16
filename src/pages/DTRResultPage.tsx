import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { InfoSection } from '../components/InfoSection';
import { TimeSection } from '../components/TimeSection';
import { GeneralSection } from '../components/GeneralSection';
import { ExtractionSuccessModal } from '../components/ExtractionSuccessModal';
import { ExportFormatModal } from '../components/ExportFormatModal';
import { useDTR } from '../hooks/useDTR';
import { DTRRecord, TimeEntry } from '../types/dtr.types';
import { exportRecordAsExcel, exportRecordAsPdf } from '../services/reportExport';
import { recomputeRecord } from '../services/timeCalculator';

type EditableRecordField = 'employeeName' | 'position' | 'department' | 'salaryGrade' | 'stepIncrement';
type EditableEntryField = 'amIn' | 'amOut' | 'pmIn' | 'pmOut' | 'remarks';

const normalizeTimeInput = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const modeMeta = {
  local: {
    badge: 'Local Mode',
    className: 'mode-badge local',
    tooltip: 'Processed via local OCR + Qwen3 reasoning through OpenRouter.',
  },
  free: {
    badge: 'Free Mode',
    className: 'mode-badge free',
    tooltip: 'Processed via OpenRouter AI fallback chain.',
  },
  legacy: {
    badge: 'Legacy Mode',
    className: 'mode-badge legacy',
    tooltip: 'Processed via Gemini API compatibility flow.',
  },
} as const;

export const DTRResultPage: React.FC = () => {
  const navigate = useNavigate();
  const { record, mergedFileCount, extractionSummary } = useDTR();
  const [showExtractionModal, setShowExtractionModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [editableRecord, setEditableRecord] = useState<DTRRecord | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setShowExtractionModal(Boolean(record && extractionSummary));
  }, [record, extractionSummary]);

  useEffect(() => {
    if (record) {
      setEditableRecord(recomputeRecord(record));
    }
  }, [record]);

  if (!record || !editableRecord) {
    return <Navigate to="/" replace />;
  }

  const handleRecordFieldChange = (field: EditableRecordField, value: string) => {
    setEditableRecord((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        ...prev,
        [field]: value,
      };
    });
  };

  const handleEntryFieldChange = (index: number, field: EditableEntryField, value: string) => {
    setEditableRecord((prev) => {
      if (!prev) {
        return prev;
      }

      const nextEntries: TimeEntry[] = prev.entries.map((entry, itemIndex) => {
        if (itemIndex !== index) {
          return entry;
        }

        if (field === 'remarks') {
          return {
            ...entry,
            remarks: value,
          };
        }

        return {
          ...entry,
          [field]: normalizeTimeInput(value),
        };
      });

      return recomputeRecord({
        ...prev,
        entries: nextEntries,
      });
    });
  };

  const handleExportSelection = (format: 'pdf' | 'excel') => {
    try {
      if (format === 'pdf') {
        exportRecordAsPdf(editableRecord);
      } else {
        exportRecordAsExcel(editableRecord);
      }
      setLocalError(null);
      setShowExportModal(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Export failed. Please try again.');
    }
  };

  return (
    <div className="result-page">
      <header className="result-header card">
        <div>
          <h1>{editableRecord.employeeName || 'DTR Result'}</h1>
          <p>{editableRecord.month || 'No month provided'}</p>
        </div>

        <div className="result-header-actions">
          {extractionSummary && (
            <span className={modeMeta[extractionSummary.mode].className} title={modeMeta[extractionSummary.mode].tooltip}>
              {modeMeta[extractionSummary.mode].badge}
            </span>
          )}
          {mergedFileCount > 1 && <span className="merge-badge">{mergedFileCount} files merged</span>}
          <button type="button" className="primary-btn" onClick={() => setShowExportModal(true)}>
            Export Report
          </button>
          <button type="button" className="ghost-btn" onClick={() => navigate('/')}>
            Back to Upload
          </button>
        </div>
      </header>

      {localError && <p className="error-text inline-error result-inline-error">{localError}</p>}

      <main className="result-grid">
        <InfoSection
          record={editableRecord}
          isEditable
          onRecordFieldChange={handleRecordFieldChange}
        />
        <TimeSection
          entries={editableRecord.entries}
          isEditable
          onEntryFieldChange={handleEntryFieldChange}
        />
        <GeneralSection hoursRendered={editableRecord.totalHoursRendered} />
      </main>

      <ExtractionSuccessModal
        isOpen={showExtractionModal}
        summary={extractionSummary}
        onClose={() => setShowExtractionModal(false)}
      />

      <ExportFormatModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onSelectFormat={handleExportSelection}
      />
    </div>
  );
};
