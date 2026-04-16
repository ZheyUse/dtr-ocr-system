import {
  ALL_MODELS_FAILED_ERROR,
  DTRProcessingResult,
  LOCAL_OCR_NOT_AVAILABLE_ERROR,
  OPENROUTER_RATE_LIMIT_ERROR,
  ProcessingMode,
} from '../types/dtr.types';
import {
  RATE_LIMIT_ERROR,
  extractDTRFromFile,
  extractDTRFromOCRTextViaGemini,
  clearLastExtractionDebug,
  getLastExtractionDebug,
} from '../services/geminiService';
import { mergeRecords } from '../services/timeCalculator';
import { parseGeminiDTR } from '../services/dtrParser';
import {
  LocalOCRExtractionPayload,
  extractLocalOCRPayload,
  isLocalOCRServerAvailable,
} from '../services/localOCRService';
import {
  extractDTRFromOCRTextViaOpenRouter,
  extractDTRFromOpenRouterVision,
} from '../services/openRouterService';

interface ProcessDTROptions {
  minOverlayMs?: number;
  onProgress?: (processedCount: number, totalCount: number, currentFile: File) => void;
  onLocalOCRReady?: (currentFile: File, payload: LocalOCRExtractionPayload) => void;
}

const wait = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
};

const tryParseDeterministicRecord = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  try {
    return parseGeminiDTR(JSON.stringify(value));
  } catch {
    return null;
  }
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
        const localOCR = await extractLocalOCRPayload(file);
        options.onLocalOCRReady?.(file, localOCR);
        const deterministicRecord = tryParseDeterministicRecord(localOCR.structuredDtr);
        const parserMeta = localOCR.structuredMeta;
        const parserConfidence = parserMeta?.confidence ?? 0;
        const parserEntryCount = parserMeta?.entryCount ?? 0;
        const parserShouldUseLLM = parserMeta?.shouldUseLLM ?? true;
        const useDeterministic =
          Boolean(deterministicRecord) &&
          parserEntryCount > 0 &&
          !parserShouldUseLLM &&
          parserConfidence >= 0.72;

        if (useDeterministic && deterministicRecord) {
          records.push(deterministicRecord);
          modelsUsed.push({
            fileName: file.name,
            modelName: `PaddleOCR Heuristic Parser (${parserConfidence.toFixed(2)})`,
            apiVersion: 'local',
            usedFallback: false,
            provider: 'local-ocr',
          });
        } else {
          try {
            const localResult = await extractDTRFromOCRTextViaOpenRouter(localOCR.text, localOCR.ocrJson);

            records.push(localResult.record);
            modelsUsed.push({
              fileName: file.name,
              modelName: localResult.model,
              apiVersion: 'openrouter',
              usedFallback: localResult.usedFallback,
              provider: 'local-ocr',
            });
          } catch (openRouterError) {
            const geminiFallbackResult = await extractDTRFromOCRTextViaGemini(localOCR.text, localOCR.ocrJson);

            records.push(geminiFallbackResult.record);
            modelsUsed.push({
              fileName: file.name,
              modelName: `${geminiFallbackResult.model} (Gemini OCR-text fallback)`,
              apiVersion: 'gemini',
              usedFallback: true,
              provider: 'gemini',
            });

            try {
              console.warn('[dtrController] Local mode used Gemini fallback after OpenRouter failure', {
                fileName: file.name,
                openRouterError:
                  openRouterError instanceof Error ? openRouterError.message : String(openRouterError),
              });
            } catch {}
          }
        }
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
        error.message === OPENROUTER_RATE_LIMIT_ERROR ||
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
