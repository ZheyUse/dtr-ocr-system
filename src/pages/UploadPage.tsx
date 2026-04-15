import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { processDTRFiles } from '../controllers/dtrController';
import { RATE_LIMIT_ERROR } from '../services/geminiService';
import { useDTR } from '../hooks/useDTR';
import { useCamera } from '../hooks/useCamera';
import { useMultiUpload } from '../hooks/useMultiUpload';
import { UploadZone } from '../components/UploadZone';
import { CameraCapture } from '../components/CameraCapture';
import { MultiFileQueue } from '../components/MultiFileQueue';
import { LoadingOverlay } from '../components/LoadingOverlay';
import { RateLimitModal } from '../components/RateLimitModal';

interface ProcessingState {
  processedCount: number;
  totalCount: number;
  currentFileName: string;
}

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
  const [processingState, setProcessingState] = useState<ProcessingState>({
    processedCount: 0,
    totalCount: 0,
    currentFileName: '',
  });

  const canProcess = files.length > 0 && !loading;

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
      const result = await processDTRFiles(files, {
        minOverlayMs: 1400,
        onProgress: (processedCount, totalCount, currentFile) => {
          setProcessingState({
            processedCount,
            totalCount,
            currentFileName: currentFile.name,
          });
        },
      });

      setRecord(result.mergedRecord, result.mergedFiles);
      navigate('/dtr-result');
    } catch (processError) {
      if (processError instanceof Error && processError.message === RATE_LIMIT_ERROR) {
        setShowRateLimitModal(true);
        return;
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
          <p>Upload your Daily Time Record images or PDF and extract data with Gemini OCR.</p>
        </header>

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

      <RateLimitModal isOpen={showRateLimitModal} onClose={() => setShowRateLimitModal(false)} />

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
