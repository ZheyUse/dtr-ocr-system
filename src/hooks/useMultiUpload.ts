import { useMemo, useState } from 'react';
import { addFilesToQueue, removeQueuedFile } from '../controllers/uploadController';

export const useMultiUpload = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const addFiles = (selected: File[] | FileList): void => {
    const incomingFiles = Array.from(selected);
    const { files: nextFiles, errors: nextErrors } = addFilesToQueue(files, incomingFiles);

    setFiles(nextFiles);
    setErrors(nextErrors);
  };

  const removeFile = (index: number): void => {
    setFiles((previousFiles) => removeQueuedFile(previousFiles, index));
  };

  const clearFiles = (): void => {
    setFiles([]);
  };

  const clearErrors = (): void => {
    setErrors([]);
  };

  const combinedError = useMemo(() => errors.join(' '), [errors]);

  return {
    files,
    errors,
    combinedError,
    addFiles,
    removeFile,
    clearFiles,
    clearErrors,
  };
};
