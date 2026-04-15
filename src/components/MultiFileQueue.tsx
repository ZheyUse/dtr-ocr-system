import React, { useEffect, useMemo } from 'react';

interface MultiFileQueueProps {
  files: File[];
  onRemove: (index: number) => void;
}

const formatFileSize = (size: number): string => {
  const kb = size / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(2)} MB`;
};

export const MultiFileQueue: React.FC<MultiFileQueueProps> = ({ files, onRemove }) => {
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

  if (files.length === 0) {
    return null;
  }

  return (
    <section className="queue card">
      <div className="queue-header-row">
        <h3>Queued Files</h3>
        <span className="queue-count">{files.length}</span>
      </div>

      <ul className="queue-list">
        {previews.map((preview, index) => (
          <li key={`${preview.file.name}-${preview.file.lastModified}`} className="queue-item">
            <div className="queue-item-preview-wrap">
              {preview.url ? (
                <img src={preview.url} alt={preview.file.name} className="queue-item-preview" />
              ) : (
                <div className="queue-item-pdf">PDF</div>
              )}
            </div>

            <div className="queue-item-meta">
              <p className="queue-item-name" title={preview.file.name}>
                {preview.file.name}
              </p>
              <p className="queue-item-size">{formatFileSize(preview.file.size)}</p>
            </div>

            <button
              type="button"
              className="queue-remove-btn"
              onClick={() => onRemove(index)}
              aria-label={`Remove ${preview.file.name}`}
            >
              x
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
