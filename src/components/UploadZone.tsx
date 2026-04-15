import React, { useEffect, useMemo, useRef, useState } from 'react';

interface UploadZoneProps {
  files: File[];
  onSelectFiles: (files: FileList | File[]) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ files, onSelectFiles }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const imagePreviews = useMemo(() => {
    return files
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({
        file,
        url: URL.createObjectURL(file),
      }));
  }, [files]);

  useEffect(() => {
    return () => {
      imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [imagePreviews]);

  const handleBrowseClick = (): void => {
    inputRef.current?.click();
  };

  const handleFiles = (selected: FileList | null): void => {
    if (!selected || selected.length === 0) {
      return;
    }

    onSelectFiles(selected);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  return (
    <section
      className={`upload-zone ${isDragging ? 'dragging' : ''}`}
      onClick={handleBrowseClick}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleBrowseClick();
        }
      }}
    >
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={(event) => handleFiles(event.target.files)}
      />

      <div className="upload-icon" aria-hidden="true">
        <span>OCR</span>
      </div>
      <h2>Drop your DTR here</h2>
      <p>or click to browse</p>

      {files.length > 0 && (
        <div className="upload-preview-grid">
          {imagePreviews.slice(0, 4).map((preview) => (
            <img
              key={`${preview.file.name}-${preview.file.lastModified}`}
              src={preview.url}
              alt={preview.file.name}
              className="upload-preview-thumb"
            />
          ))}
          {files.length > 4 && <div className="upload-more-indicator">+{files.length - 4} more</div>}
        </div>
      )}
    </section>
  );
};
