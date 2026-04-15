import { DTRProcessingResult } from '../types/dtr.types';
import {
  RATE_LIMIT_ERROR,
  extractDTRFromFile,
  clearLastExtractionDebug,
  getLastExtractionDebug,
} from '../services/geminiService';
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
  const modelsUsed: DTRProcessingResult['extractionSummary']['perFile'] = [];

  try {
    // clear any previous extraction debug info
    try {
      clearLastExtractionDebug();
    } catch {}
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      options.onProgress?.(index, files.length, file);

      const parsedRecord = await extractDTRFromFile(file);
      records.push(parsedRecord);

      const debug = getLastExtractionDebug();
      const attempts = debug?.attempts ?? [];
      const successIndex = attempts.findIndex((attempt) => attempt.status === 200);
      const successAttempt = successIndex >= 0 ? attempts[successIndex] : null;

      if (successAttempt) {
        modelsUsed.push({
          fileName: file.name,
          modelName: successAttempt.modelName,
          apiVersion: successAttempt.apiVersion,
          usedFallback: successIndex > 0,
        });
      }

      options.onProgress?.(index + 1, files.length, file);
    }

    const mergedRecord = mergeRecords(records);
    const fallbackUsed = modelsUsed.some((model) => model.usedFallback);
    const primaryModel = modelsUsed[0]
      ? `${modelsUsed[0].modelName} (${modelsUsed[0].apiVersion})`
      : 'Unknown model';

    const elapsed = Date.now() - startedAt;
    if (elapsed < minOverlayMs) {
      await wait(minOverlayMs - elapsed);
    }

    return {
      mergedRecord,
      mergedFiles: files.length,
      extractionSummary: {
        primaryModelLabel: primaryModel,
        usedFallback: fallbackUsed,
        perFile: modelsUsed,
      },
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
