import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { processDTRFiles } from '../controllers/dtrController';
import { RATE_LIMIT_ERROR, getLastExtractionDebug } from '../services/geminiService';
import { useDTR } from '../hooks/useDTR';
import { useCamera } from '../hooks/useCamera';
import { useMultiUpload } from '../hooks/useMultiUpload';
import { UploadZone } from '../components/UploadZone';
import { CameraCapture } from '../components/CameraCapture';
import { MultiFileQueue } from '../components/MultiFileQueue';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { RateLimitModal } from '../components/RateLimitModal';
import { ModeSelectModal } from '../components/ModeSelectModal';
import { LocalOCRUnavailableModal } from '../components/LocalOCRUnavailableModal';
import {
  ALL_MODELS_FAILED_ERROR,
  LOCAL_OCR_NOT_AVAILABLE_ERROR,
  OPENROUTER_CONNECTIVITY_ERROR,
  ProcessingMode,
} from '../types/dtr.types';

interface ProcessingState {
  processedCount: number;
  totalCount: number;
  currentFileName: string;
}

const MODE_STORAGE_KEY = 'dtr-processing-mode';

const getStoredMode = (): ProcessingMode => {
  const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
  if (storedMode === 'local' || storedMode === 'free' || storedMode === 'legacy') {
    return storedMode;
  }

  return 'legacy';
};

const modeLabel: Record<ProcessingMode, string> = {
  local: 'Local Mode',
  free: 'Free Mode',
  legacy: 'Legacy Mode',
};

const waitForUiFrame = (): Promise<void> => {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 120);
  });
};

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const { setRecord, loading, setLoading, error, setError } = useDTR();
  const { files, addFiles, removeFile, combinedError, clearErrors } = useMultiUpload();
  const camera = useCamera();

  const [showRateLimitModal, setShowRateLimitModal] = useState(false);
  const [showModeSelectModal, setShowModeSelectModal] = useState(false);
  const [showLocalUnavailableModal, setShowLocalUnavailableModal] = useState(false);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>(() => getStoredMode());
  const [lastDebug, setLastDebug] = useState<any>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    processedCount: 0,
    totalCount: 0,
    currentFileName: '',
  });

  const canProcess = files.length > 0 && !loading;
  const localEndpoint = process.env.REACT_APP_LOCAL_OCR_ENDPOINT || 'http://localhost:5000/ocr';

  const inlineError = useMemo(() => {
    return error || combinedError || null;
  }, [error, combinedError]);

  const handleProcessDTR = async (): Promise<void> => {
    if (files.length === 0) {
      return;
    }

    clearErrors();
    setError(null);
    setLoading(true);
    setProcessingState({
      processedCount: 0,
      totalCount: files.length,
      currentFileName: 'Preparing image analysis...',
    });

    await waitForUiFrame();

    try {
      const result = await processDTRFiles(files, processingMode, {
        minOverlayMs: 1400,
        onProgress: (processedCount, totalCount, currentFile) => {
          setProcessingState({
            processedCount,
            totalCount,
            currentFileName: currentFile.name,
          });
        },
      });

      setRecord(result.mergedRecord, result.mergedFiles, result.extractionSummary);
      navigate('/dtr-result');
    } catch (processError) {
      if (processError instanceof Error && processError.message === LOCAL_OCR_NOT_AVAILABLE_ERROR) {
        setShowLocalUnavailableModal(true);
        return;
      }

      if (processError instanceof Error && processError.message === RATE_LIMIT_ERROR) {
        try {
          setLastDebug(getLastExtractionDebug());
        } catch {}
        setShowRateLimitModal(true);
        return;
      }

      if (
        processError instanceof Error &&
        processError.message.startsWith(OPENROUTER_CONNECTIVITY_ERROR)
      ) {
        if (processingMode === 'local') {
          setError('Local OCR is ready, but OpenRouter is unreachable. Check internet, API key, and OpenRouter endpoint settings.');
          return;
        }

        if (processingMode === 'free') {
          setError('Free Mode cannot reach OpenRouter right now. Check internet, API key, and OpenRouter endpoint settings.');
          return;
        }
      }

      if (processError instanceof Error && processError.message === ALL_MODELS_FAILED_ERROR) {
        if (processingMode === 'free') {
          setError('All OpenRouter models failed. Try Local Mode for better reliability or Legacy Mode for compatibility.');
          return;
        }

        if (processingMode === 'local') {
          setError('Local OCR pipeline failed to parse this file. Try Free Mode or Legacy Mode.');
          return;
        }
      }

      setError(
        processError instanceof Error
          ? processError.message
          : 'Unable to process files right now. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <main className="upload-page card">
        <header className="upload-header">
          <h1>DTR OCR System</h1>
          <p>Upload DTR images or PDF and extract data using Local, Free, or Legacy processing mode.</p>
        </header>

        <div className="mode-bar card">
          <span className="mode-chip">{modeLabel[processingMode]}</span>
          <button type="button" className="ghost-btn" onClick={() => setShowModeSelectModal(true)}>
            Change Mode
          </button>
        </div>

        <UploadZone files={files} onSelectFiles={addFiles} />

        <div className="upload-actions">
          <button type="button" className="ghost-btn" onClick={() => void camera.openCamera()}>
            Use Camera
          </button>

          <button
            type="button"
            className="primary-btn"
            disabled={!canProcess}
            onClick={() => void handleProcessDTR()}
          >
            {loading ? 'Processing...' : 'Process DTR'}
          </button>
        </div>

        {inlineError && <p className="error-text inline-error">{inlineError}</p>}

        <MultiFileQueue files={files} onRemove={removeFile} />
      </main>

      <CameraCapture
        isOpen={camera.isOpen}
        stream={camera.stream}
        error={camera.error}
        onStart={camera.openCamera}
        onClose={camera.closeCamera}
        onCaptureFile={(file) => addFiles([file])}
        captureFrame={camera.captureFrame}
      />

      <RateLimitModal
        isOpen={showRateLimitModal}
        onClose={() => setShowRateLimitModal(false)}
        debug={lastDebug}
      />

      <ModeSelectModal
        isOpen={showModeSelectModal}
        selectedMode={processingMode}
        onSelectMode={(mode) => {
          setProcessingMode(mode);
          window.localStorage.setItem(MODE_STORAGE_KEY, mode);
        }}
        onClose={() => setShowModeSelectModal(false)}
      />

      <LocalOCRUnavailableModal
        isOpen={showLocalUnavailableModal}
        endpoint={localEndpoint}
        onRetry={() => {
          setShowLocalUnavailableModal(false);
          void handleProcessDTR();
        }}
        onSwitchToFree={() => {
          setProcessingMode('free');
          window.localStorage.setItem(MODE_STORAGE_KEY, 'free');
          setShowLocalUnavailableModal(false);
        }}
        onSwitchToLegacy={() => {
          setProcessingMode('legacy');
          window.localStorage.setItem(MODE_STORAGE_KEY, 'legacy');
          setShowLocalUnavailableModal(false);
        }}
        onClose={() => setShowLocalUnavailableModal(false)}
      />

      <LoadingOverlay
        isVisible={loading}
        files={files}
        processedCount={processingState.processedCount}
        totalCount={processingState.totalCount}
        currentFileName={processingState.currentFileName}
      />
    </div>
  );
};
