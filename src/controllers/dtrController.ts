import { DTRProcessingResult } from '../types/dtr.types';
import { RATE_LIMIT_ERROR, extractDTRFromFile } from '../services/geminiService';
import { mergeRecords } from '../services/timeCalculator';

interface ProcessDTROptions {
  minOverlayMs?: number;
  onProgress?: (processedCount: number, totalCount: number, currentFile: File) => void;
}

const wait = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
};

export const processDTRFiles = async (
  files: File[],
  options: ProcessDTROptions = {}
): Promise<DTRProcessingResult> => {
  if (!files.length) {
    throw new Error('Please upload at least one file.');
  }

  const minOverlayMs = options.minOverlayMs ?? 1200;
  const startedAt = Date.now();
  const records = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      options.onProgress?.(index, files.length, file);

      const parsedRecord = await extractDTRFromFile(file);
      records.push(parsedRecord);

      options.onProgress?.(index + 1, files.length, file);
    }

    const mergedRecord = mergeRecords(records);

    const elapsed = Date.now() - startedAt;
    if (elapsed < minOverlayMs) {
      await wait(minOverlayMs - elapsed);
    }

    return {
      mergedRecord,
      mergedFiles: files.length,
    };
  } catch (error) {
    if (error instanceof Error && error.message === RATE_LIMIT_ERROR) {
      throw error;
    }

    throw error instanceof Error
      ? error
      : new Error('Unexpected error while processing DTR files.');
  }
};
