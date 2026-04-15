const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_QUEUE_FILES = 6;

const isSupportedType = (file: File): boolean => {
  return file.type.startsWith('image/') || file.type === 'application/pdf';
};

const makeFileKey = (file: File): string => {
  return `${file.name}-${file.size}-${file.lastModified}`;
};

export const validateFile = (file: File): string | null => {
  if (!isSupportedType(file)) {
    return `${file.name}: Unsupported file type. Use images or PDF only.`;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `${file.name}: File exceeds ${MAX_FILE_SIZE_MB}MB.`;
  }

  return null;
};

export const addFilesToQueue = (
  currentFiles: File[],
  incomingFiles: File[]
): { files: File[]; errors: string[] } => {
  const errors: string[] = [];
  const existingKeys = new Set(currentFiles.map(makeFileKey));
  const nextFiles = [...currentFiles];

  for (const file of incomingFiles) {
    const validationError = validateFile(file);
    if (validationError) {
      errors.push(validationError);
      continue;
    }

    const key = makeFileKey(file);
    if (existingKeys.has(key)) {
      continue;
    }

    if (nextFiles.length >= MAX_QUEUE_FILES) {
      errors.push(`Maximum of ${MAX_QUEUE_FILES} files can be uploaded at once.`);
      break;
    }

    existingKeys.add(key);
    nextFiles.push(file);
  }

  return {
    files: nextFiles,
    errors,
  };
};

export const removeQueuedFile = (files: File[], index: number): File[] => {
  return files.filter((_, fileIndex) => fileIndex !== index);
};
