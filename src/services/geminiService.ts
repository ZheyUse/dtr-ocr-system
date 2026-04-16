import { GoogleGenAI, createPartFromBase64 } from '@google/genai';
import {
  GEMINI_MODEL_CANDIDATES,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_OCR_TEXT_PROMPT_TEMPLATE,
  GEMINI_PROMPT_TEMPLATE,
  GeminiModelCandidate,
} from '../config/gemini.config';
import { DTRRecord } from '../types/dtr.types';
import { parseGeminiDTR } from './dtrParser';

const RATE_LIMIT_ERROR = 'RATE_LIMIT_HIT';
const MODEL_NOT_AVAILABLE_ERROR = 'MODEL_NOT_AVAILABLE';

type ApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown;
  };
};

type AttemptInfo = {
  modelName: string;
  apiVersion: string;
  status?: number;
  isRateLimit?: boolean;
  isModelNotFound?: boolean;
  serializedError?: unknown;
};

type ExtractionDebug = {
  attempts: AttemptInfo[];
  fileName?: string;
  timestamp: number;
  finalError?: unknown;
};

let lastExtractionDebug: ExtractionDebug | null = null;

const extractApiErrorPayload = (error: unknown): ApiErrorPayload | null => {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const maybeError = error as { message?: string; body?: string };
  const raw = maybeError.body || maybeError.message;

  if (!raw || typeof raw !== 'string' || !raw.trim().startsWith('{')) {
    return null;
  }

  try {
    return JSON.parse(raw) as ApiErrorPayload;
  } catch {
    return null;
  }
};

const extractStatusCode = (error: unknown): number | undefined => {
  const direct = error as { status?: number; code?: number };
  if (typeof direct?.status === 'number') {
    return direct.status;
  }
  if (typeof direct?.code === 'number') {
    return direct.code;
  }

  const payload = extractApiErrorPayload(error);
  if (typeof payload?.error?.code === 'number') {
    return payload.error.code;
  }

  return undefined;
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to convert file to base64.'));
        return;
      }

      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Base64 payload is empty.'));
        return;
      }

      resolve(base64);
    };

    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
};

const isRateLimitError = (error: unknown): boolean => {
  if (!error) {
    return false;
  }

  const status = extractStatusCode(error);
  const payloadMessage = extractApiErrorPayload(error)?.error?.message ?? '';
  const maybeError = error as { message?: string };
  const message = `${maybeError.message ?? ''} ${payloadMessage}`.toLowerCase();

  return status === 429 || /rate limit|quota|resource has been exhausted|too many requests/.test(message);
};

const isModelNotFoundError = (error: unknown): boolean => {
  if (!error) {
    return false;
  }

  const status = extractStatusCode(error);
  const payloadMessage = extractApiErrorPayload(error)?.error?.message ?? '';
  const maybeError = error as { message?: string };
  const message = `${maybeError.message ?? ''} ${payloadMessage}`.toLowerCase();

  return status === 404 || /not found for api version|not supported for generatecontent|model.*not found/.test(message);
};

const safeSerializeError = (error: unknown) => {
  try {
    if (!error) return { message: String(error) };
    if (typeof error === 'string') return { message: error };
    if (error instanceof Error) {
      const e: any = error as any;
      const out: Record<string, unknown> = {
        name: e.name,
        message: e.message,
        stack: e.stack,
      };
      // copy enumerable props
      for (const k of Object.keys(e)) {
        try {
          out[k] = e[k];
        } catch {}
      }

      // common HTTP-like shapes
      try {
        const anyErr = e as any;
        if (anyErr.status) out.status = anyErr.status;
        if (anyErr.code) out.code = anyErr.code;
        if (anyErr.body) out.body = anyErr.body;
        if (anyErr.response) {
          out.response = {
            status: anyErr.response.status,
            statusText: anyErr.response.statusText,
            data: anyErr.response.data ?? anyErr.response.body ?? anyErr.response,
          };
        }
      } catch {}

      return out;
    }

    // plain object
    return JSON.parse(JSON.stringify(error));
  } catch (err) {
    return { message: 'Unable to serialize error', error: String(err) };
  }
};

const truncateForPrompt = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n\n[truncated]`;
};

const buildGeminiOCRTextPrompt = (ocrText: string, ocrJson?: unknown): string => {
  const compactJson = ocrJson ? truncateForPrompt(JSON.stringify(ocrJson), 18000) : '';
  const compactText = truncateForPrompt(ocrText, 12000);

  if (compactJson) {
    return `${GEMINI_OCR_TEXT_PROMPT_TEMPLATE}\n\nOCR CANONICAL JSON:\n${compactJson}\n\nOCR RAW TEXT:\n${compactText}`;
  }

  return `${GEMINI_OCR_TEXT_PROMPT_TEMPLATE}\n\nOCR RAW TEXT:\n${compactText}`;
};

const getClient = (apiVersion: GeminiModelCandidate['apiVersion']): GoogleGenAI => {
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('REACT_APP_GEMINI_API_KEY is missing. Add it to your .env file.');
  }

  return new GoogleGenAI({
    apiKey,
    apiVersion,
  });
};

export const clearLastExtractionDebug = () => {
  lastExtractionDebug = { attempts: [], timestamp: Date.now() };
};

export const getLastExtractionDebug = (): ExtractionDebug | null => {
  return lastExtractionDebug;
};

const runModelExtraction = async (
  ai: GoogleGenAI,
  apiVersion: GeminiModelCandidate['apiVersion'],
  modelName: string,
  file: File,
  base64Data: string
): Promise<DTRRecord> => {
  try {
    console.debug('[geminiService] calling model', {
      modelName,
      apiVersion,
      fileName: file.name,
      fileType: file.type,
    });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        GEMINI_PROMPT_TEMPLATE,
        createPartFromBase64(base64Data, file.type || 'application/octet-stream'),
      ],
      config: {
        temperature: 0,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      },
    });

    // log response metadata for debugging (do not log API keys)
    try {
      console.debug('[geminiService] model response meta', {
        model: modelName,
        apiVersion,
        textPresent: Boolean(response?.text),
        parts: Array.isArray((response as any)?.parts) ? (response as any).parts.length : undefined,
      });
    } catch {}

    const textOutput = response.text?.trim();
    if (!textOutput) {
      console.error('[geminiService] Empty text output from model', {
        modelName,
        apiVersion,
        fileName: file.name,
        response: safeSerializeError(response),
      });
      throw new Error('INVALID_RESPONSE');
    }

    return parseGeminiDTR(textOutput);
  } catch (err) {
    // Serialize useful fields for debugging; callers can rethrow or act on type
    const serialized = safeSerializeError(err);
    console.error('[geminiService] generateContent failed', {
      modelName,
      apiVersion,
      fileName: file.name,
      error: serialized,
    });
    throw err;
  }
};

const runModelExtractionFromText = async (
  ai: GoogleGenAI,
  apiVersion: GeminiModelCandidate['apiVersion'],
  modelName: string,
  prompt: string
): Promise<DTRRecord> => {
  try {
    console.debug('[geminiService] calling text model', {
      modelName,
      apiVersion,
      promptLength: prompt.length,
    });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [prompt],
      config: {
        temperature: 0,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      },
    });

    const textOutput = response.text?.trim();
    if (!textOutput) {
      console.error('[geminiService] Empty text output from text-based extraction', {
        modelName,
        apiVersion,
        response: safeSerializeError(response),
      });
      throw new Error('INVALID_RESPONSE');
    }

    return parseGeminiDTR(textOutput);
  } catch (err) {
    console.error('[geminiService] text generateContent failed', {
      modelName,
      apiVersion,
      error: safeSerializeError(err),
    });
    throw err;
  }
};

export const extractDTRFromFile = async (file: File): Promise<DTRRecord> => {
  try {
    const base64Data = await fileToBase64(file);
    // initialize debug for this extraction
    lastExtractionDebug = { attempts: [], fileName: file.name, timestamp: Date.now() };
    const modelCandidates = Array.from(
      new Map(
        GEMINI_MODEL_CANDIDATES.map((candidate) => [`${candidate.apiVersion}:${candidate.model}`, candidate])
      ).values()
    );

    let lastError: unknown;
    let seenRateLimit = false;
    let seenModelNotFound = false;

    for (const candidate of modelCandidates) {
      const ai = getClient(candidate.apiVersion);
      try {
        const record = await runModelExtraction(ai, candidate.apiVersion, candidate.model, file, base64Data);
        // record successful attempt for debugging
        try {
          if (!lastExtractionDebug) lastExtractionDebug = { attempts: [], fileName: file.name, timestamp: Date.now() };
          lastExtractionDebug.attempts.push({
            modelName: candidate.model,
            apiVersion: candidate.apiVersion,
            status: 200,
            isRateLimit: false,
            isModelNotFound: false,
            serializedError: { success: true },
          });
        } catch {}

        return record;
      } catch (attemptError) {
        lastError = attemptError;
        const isRateLimit = isRateLimitError(attemptError);
        const isModelNotFound = isModelNotFoundError(attemptError);
        seenRateLimit = seenRateLimit || isRateLimit;
        seenModelNotFound = seenModelNotFound || isModelNotFound;

        // persist attempt info for UI/debugging
        try {
          if (!lastExtractionDebug) lastExtractionDebug = { attempts: [], fileName: file.name, timestamp: Date.now() };
          lastExtractionDebug.attempts.push({
            modelName: candidate.model,
            apiVersion: candidate.apiVersion,
            status: extractStatusCode(attemptError),
            isRateLimit,
            isModelNotFound,
            serializedError: safeSerializeError(attemptError),
          });
        } catch {}

        console.warn('[geminiService] model attempt failed', {
          modelName: candidate.model,
          apiVersion: candidate.apiVersion,
          fileName: file.name,
          status: extractStatusCode(attemptError),
          isRateLimit,
          isModelNotFound,
          error: safeSerializeError(attemptError),
        });
      }
    }

    // record final error for debugging
    try {
      if (!lastExtractionDebug) lastExtractionDebug = { attempts: [], fileName: file.name, timestamp: Date.now() };
      lastExtractionDebug.finalError = lastError;
      lastExtractionDebug.timestamp = Date.now();
    } catch {}

    if (seenRateLimit || isRateLimitError(lastError)) {
      throw new Error(RATE_LIMIT_ERROR);
    }

    if (seenModelNotFound || isModelNotFoundError(lastError)) {
      throw new Error(MODEL_NOT_AVAILABLE_ERROR);
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw new Error('Failed to process DTR image.');
  } catch (error) {
    if (error instanceof Error && error.message === RATE_LIMIT_ERROR) {
      throw error;
    }

    if (error instanceof Error && error.message === MODEL_NOT_AVAILABLE_ERROR) {
      throw new Error(
        'No configured Gemini model is available for your current key/region. Check model access and try v1beta-compatible Flash models.'
      );
    }

    if (isRateLimitError(error)) {
      throw new Error(RATE_LIMIT_ERROR);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Failed to process DTR image.');
  }
};

export const extractDTRFromOCRTextViaGemini = async (
  ocrText: string,
  ocrJson?: unknown
): Promise<{ record: DTRRecord; model: string; usedFallback: boolean }> => {
  const prompt = buildGeminiOCRTextPrompt(ocrText, ocrJson);
  const modelCandidates = Array.from(
    new Map(
      GEMINI_MODEL_CANDIDATES.map((candidate) => [`${candidate.apiVersion}:${candidate.model}`, candidate])
    ).values()
  );

  let lastError: unknown;
  let seenRateLimit = false;
  let seenModelNotFound = false;

  try {
    lastExtractionDebug = { attempts: [], fileName: 'local-ocr-text-fallback', timestamp: Date.now() };
  } catch {}

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const candidate = modelCandidates[index];
    const ai = getClient(candidate.apiVersion);

    try {
      const record = await runModelExtractionFromText(ai, candidate.apiVersion, candidate.model, prompt);

      try {
        if (!lastExtractionDebug) {
          lastExtractionDebug = { attempts: [], fileName: 'local-ocr-text-fallback', timestamp: Date.now() };
        }
        lastExtractionDebug.attempts.push({
          modelName: candidate.model,
          apiVersion: candidate.apiVersion,
          status: 200,
          isRateLimit: false,
          isModelNotFound: false,
          serializedError: { success: true },
        });
      } catch {}

      return {
        record,
        model: candidate.model,
        usedFallback: index > 0,
      };
    } catch (attemptError) {
      lastError = attemptError;
      const attemptRateLimit = isRateLimitError(attemptError);
      const attemptModelNotFound = isModelNotFoundError(attemptError);
      seenRateLimit = seenRateLimit || attemptRateLimit;
      seenModelNotFound = seenModelNotFound || attemptModelNotFound;

      try {
        if (!lastExtractionDebug) {
          lastExtractionDebug = { attempts: [], fileName: 'local-ocr-text-fallback', timestamp: Date.now() };
        }
        lastExtractionDebug.attempts.push({
          modelName: candidate.model,
          apiVersion: candidate.apiVersion,
          status: extractStatusCode(attemptError),
          isRateLimit: attemptRateLimit,
          isModelNotFound: attemptModelNotFound,
          serializedError: safeSerializeError(attemptError),
        });
      } catch {}
    }
  }

  try {
    if (!lastExtractionDebug) {
      lastExtractionDebug = { attempts: [], fileName: 'local-ocr-text-fallback', timestamp: Date.now() };
    }
    lastExtractionDebug.finalError = lastError;
    lastExtractionDebug.timestamp = Date.now();
  } catch {}

  if (seenRateLimit || isRateLimitError(lastError)) {
    throw new Error(RATE_LIMIT_ERROR);
  }

  if (seenModelNotFound || isModelNotFoundError(lastError)) {
    throw new Error(
      'No configured Gemini model is available for your current key/region. Check model access and try v1beta-compatible Flash models.'
    );
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error('Failed to process OCR text with Gemini fallback.');
};

export { RATE_LIMIT_ERROR, MODEL_NOT_AVAILABLE_ERROR };
