import React, { useEffect, useMemo } from 'react';

interface LoadingOverlayProps {
  isVisible: boolean;
  files: File[];
  processedCount: number;
  totalCount: number;
  currentFileName: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  files,
  processedCount,
  totalCount,
  currentFileName,
}) => {
  const previews = useMemo(() => {
    return files.map((file) => ({
      file,
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }));
  }, [files]);

  useEffect(() => {
    return () => {
      previews.forEach((preview) => {
        if (preview.url) {
          URL.revokeObjectURL(preview.url);
        }
      });
    };
  }, [previews]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-label="Processing DTR">
      <div className="loading-card card">
        <h3>Scanning your DTR...</h3>
        <p>
          Processing file {Math.min(processedCount + 1, totalCount)} of {totalCount}
        </p>
        <p className="loading-current-file">{currentFileName || 'Preparing image analysis...'}</p>

        <div className="scan-preview-grid">
          {previews.map((preview, index) => (
            <div key={`${preview.file.name}-${preview.file.lastModified}`} className="scan-preview-item">
              {preview.url ? (
                <img src={preview.url} alt={preview.file.name} className="scan-preview-image" />
              ) : (
                <div className="scan-preview-pdf">PDF</div>
              )}
              <div className="scan-line" style={{ animationDelay: `${index * 0.12}s` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
