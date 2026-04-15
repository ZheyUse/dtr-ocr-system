import { GoogleGenAI, createPartFromBase64 } from '@google/genai';
import {
  GEMINI_FALLBACK_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_PRIMARY_MODEL,
  GEMINI_PROMPT_TEMPLATE,
} from '../config/gemini.config';
import { DTRRecord } from '../types/dtr.types';
import { parseGeminiDTR } from './dtrParser';

const RATE_LIMIT_ERROR = 'RATE_LIMIT_HIT';

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

  const maybeError = error as { message?: string; status?: number; code?: number };
  const status = maybeError.status ?? maybeError.code;
  const message = (maybeError.message ?? '').toLowerCase();

  return status === 429 || /rate limit|quota|resource has been exhausted|too many requests/.test(message);
};

const getClient = (): GoogleGenAI => {
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('REACT_APP_GEMINI_API_KEY is missing. Add it to your .env file.');
  }

  return new GoogleGenAI({ apiKey });
};

const runModelExtraction = async (
  ai: GoogleGenAI,
  modelName: string,
  file: File,
  base64Data: string
): Promise<DTRRecord> => {
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

  const textOutput = response.text?.trim();
  if (!textOutput) {
    throw new Error('INVALID_RESPONSE');
  }

  return parseGeminiDTR(textOutput);
};

export const extractDTRFromFile = async (file: File): Promise<DTRRecord> => {
  try {
    const ai = getClient();
    const base64Data = await fileToBase64(file);

    try {
      return await runModelExtraction(ai, GEMINI_PRIMARY_MODEL, file, base64Data);
    } catch (primaryError) {
      if (isRateLimitError(primaryError)) {
        throw new Error(RATE_LIMIT_ERROR);
      }

      return await runModelExtraction(ai, GEMINI_FALLBACK_MODEL, file, base64Data);
    }
  } catch (error) {
    if (error instanceof Error && error.message === RATE_LIMIT_ERROR) {
      throw error;
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

export { RATE_LIMIT_ERROR };
