import React, { useEffect, useRef, useState } from 'react';

interface CameraCaptureProps {
  isOpen: boolean;
  stream: MediaStream | null;
  error: string | null;
  onStart: () => Promise<void>;
  onClose: () => void;
  onCaptureFile: (file: File) => void;
  captureFrame: (videoElement: HTMLVideoElement) => Promise<File>;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  isOpen,
  stream,
  error,
  onStart,
  onClose,
  onCaptureFile,
  captureFrame,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !videoRef.current || !stream) {
      return;
    }

    videoRef.current.srcObject = stream;
  }, [isOpen, stream]);

  useEffect(() => {
    if (isOpen && !stream) {
      void onStart();
    }
  }, [isOpen, stream, onStart]);

  useEffect(() => {
    if (!capturedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(capturedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [capturedFile]);

  if (!isOpen) {
    return null;
  }

  const handleCapture = async (): Promise<void> => {
    if (!videoRef.current) {
      return;
    }

    try {
      setLocalError(null);
      const file = await captureFrame(videoRef.current);
      setCapturedFile(file);
    } catch {
      setLocalError('Failed to capture photo. Please try again.');
    }
  };

  const handleUsePhoto = (): void => {
    if (!capturedFile) {
      return;
    }

    onCaptureFile(capturedFile);
    setCapturedFile(null);
    onClose();
  };

  const handleClose = (): void => {
    setCapturedFile(null);
    setLocalError(null);
    onClose();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Camera capture">
      <div className="camera-modal card">
        <div className="camera-header-row">
          <h3>Capture DTR via Camera</h3>
          <button type="button" className="ghost-btn" onClick={handleClose}>
            Close
          </button>
        </div>

        {capturedFile && previewUrl ? (
          <img src={previewUrl} alt="Captured DTR" className="camera-preview" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="camera-feed" />
        )}

        {(error || localError) && <p className="error-text">{error || localError}</p>}

        <div className="camera-actions">
          {capturedFile ? (
            <>
              <button type="button" className="ghost-btn" onClick={() => setCapturedFile(null)}>
                Retake
              </button>
              <button type="button" className="primary-btn" onClick={handleUsePhoto}>
                Use Photo
              </button>
            </>
          ) : (
            <button type="button" className="primary-btn" onClick={() => void handleCapture()}>
              Capture
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
