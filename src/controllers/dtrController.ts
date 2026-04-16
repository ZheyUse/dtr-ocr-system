import {
  ALL_MODELS_FAILED_ERROR,
  DTRProcessingResult,
  LOCAL_OCR_NOT_AVAILABLE_ERROR,
  ProcessingMode,
} from '../types/dtr.types';
import {
  RATE_LIMIT_ERROR,
  extractDTRFromFile,
  clearLastExtractionDebug,
  getLastExtractionDebug,
} from '../services/geminiService';
import { mergeRecords } from '../services/timeCalculator';
import { extractLocalOCRText, isLocalOCRServerAvailable } from '../services/localOCRService';
import {
  extractDTRFromOCRTextViaOpenRouter,
  extractDTRFromOpenRouterVision,
} from '../services/openRouterService';

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
  mode: ProcessingMode,
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
    if (mode === 'local') {
      const localServerAvailable = await isLocalOCRServerAvailable();
      if (!localServerAvailable) {
        throw new Error(LOCAL_OCR_NOT_AVAILABLE_ERROR);
      }
    }

    // clear any previous extraction debug info
    try {
      clearLastExtractionDebug();
    } catch {}

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      options.onProgress?.(index, files.length, file);

      if (mode === 'local') {
        const ocrText = await extractLocalOCRText(file);
        const localResult = await extractDTRFromOCRTextViaOpenRouter(ocrText);

        records.push(localResult.record);
        modelsUsed.push({
          fileName: file.name,
          modelName: localResult.model,
          apiVersion: 'openrouter',
          usedFallback: localResult.usedFallback,
          provider: 'local-ocr',
        });
      } else if (mode === 'free') {
        const freeResult = await extractDTRFromOpenRouterVision(file);

        records.push(freeResult.record);
        modelsUsed.push({
          fileName: file.name,
          modelName: freeResult.model,
          apiVersion: 'openrouter',
          usedFallback: freeResult.usedFallback,
          provider: 'openrouter',
        });
      } else {
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
            provider: 'gemini',
          });
        }
      }

      options.onProgress?.(index + 1, files.length, file);
    }

    const mergedRecord = mergeRecords(records);
    const fallbackUsed = modelsUsed.some((model) => model.usedFallback);
    const primaryModel =
      mode === 'local'
        ? `PaddleOCR + ${modelsUsed[0]?.modelName ?? 'Qwen3'}`
        : modelsUsed[0]
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
        mode,
        primaryModelLabel: primaryModel,
        usedFallback: fallbackUsed,
        perFile: modelsUsed,
      },
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === RATE_LIMIT_ERROR ||
        error.message === LOCAL_OCR_NOT_AVAILABLE_ERROR ||
        error.message === ALL_MODELS_FAILED_ERROR)
    ) {
      throw error;
    }

    throw error instanceof Error
      ? error
      : new Error('Unexpected error while processing DTR files.');
  }
};
