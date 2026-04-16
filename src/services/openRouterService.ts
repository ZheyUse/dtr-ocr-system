import {
  DTRRecord,
  ALL_MODELS_FAILED_ERROR,
  OPENROUTER_CONNECTIVITY_ERROR,
  OPENROUTER_RATE_LIMIT_ERROR,
} from '../types/dtr.types';
import {
  OPENROUTER_BASE_URL,
  OPENROUTER_REASONING_CANDIDATES,
  OPENROUTER_VISION_CANDIDATES,
} from '../config/openrouter.config';
import { DTR_QWEN3_PROMPT } from '../config/dtrQwen3Prompt';
import { parseGeminiDTR } from './dtrParser';

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
};

const normalizeOpenRouterChatUrl = (url: string): string => {
  const cleaned = url.trim().replace(/\/+$/, '');

  if (cleaned.endsWith('/chat/completions')) {
    return cleaned;
  }

  if (cleaned.endsWith('/api/v1')) {
    return `${cleaned}/chat/completions`;
  }

  if (cleaned.endsWith('/api')) {
    return `${cleaned}/v1/chat/completions`;
  }

  return `${cleaned}/api/v1/chat/completions`;
};

const OPENROUTER_CHAT_URL = normalizeOpenRouterChatUrl(
  process.env.REACT_APP_OPENROUTER_CHAT_URL ||
    process.env.REACT_APP_OPENROUTER_BASE_URL ||
    OPENROUTER_BASE_URL
);
const OPENROUTER_MODELS_URL = OPENROUTER_CHAT_URL.replace(/\/chat\/completions$/, '/models');

let connectivityPromise: Promise<void> | null = null;

const getApiKey = (): string => {
  const key = process.env.REACT_APP_OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('REACT_APP_OPENROUTER_API_KEY is missing. Add it to your .env file.');
  }

  return key;
};

const parseJsonRecord = (text: string): Record<string, unknown> | null => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const ensureOpenRouterConnectivity = async (): Promise<void> => {
  if (connectivityPromise) {
    return connectivityPromise;
  }

  connectivityPromise = (async () => {
    const apiKey = getApiKey();

    let response: Response;
    try {
      response = await fetch(OPENROUTER_MODELS_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`${OPENROUTER_CONNECTIVITY_ERROR}: ${reason}`);
    }

    if (!response.ok) {
      throw new Error(`${OPENROUTER_CONNECTIVITY_ERROR}: HTTP_${response.status}`);
    }

    const body = await response.text();
    const payload = parseJsonRecord(body);
    const hasModelList = Array.isArray(payload?.data) || Array.isArray(payload?.models);

    if (!hasModelList) {
      console.warn('[openRouterService] OpenRouter /models is reachable but returned unexpected payload shape.');
    }
  })();

  try {
    await connectivityPromise;
  } catch (error) {
    connectivityPromise = null;
    throw error;
  }
};

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unable to encode file for OpenRouter request.'));
        return;
      }
      resolve(reader.result);
    };

    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
};

const normalizeContentToText = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: string }).text || '');
        }

        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
};

const extractStatusCode = (payload: unknown): number | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const asRecord = payload as Record<string, unknown>;

  if (typeof asRecord.status === 'number') {
    return asRecord.status;
  }

  const errorValue = asRecord.error;
  if (errorValue && typeof errorValue === 'object') {
    const errorRecord = errorValue as Record<string, unknown>;
    if (typeof errorRecord.code === 'number') {
      return errorRecord.code;
    }
  }

  return undefined;
};

const isRateLimitError = (message: string, status?: number): boolean => {
  return status === 429 || /rate limit|quota|resource_exhausted|too many requests/i.test(message);
};

const isVisionUnsupported = (message: string): boolean => {
  return /image|vision|multimodal|unsupported|does not support images/i.test(message);
};

const callOpenRouter = async (
  model: string,
  messages: OpenRouterMessage[],
  maxTokens: number
): Promise<string> => {
  await ensureOpenRouterConnectivity();
  const apiKey = getApiKey();

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      max_tokens: maxTokens,
    }),
  });

  const rawBody = await response.text();
  const parsedBody = parseJsonRecord(rawBody);
  const payload = parsedBody || { raw: rawBody };

  if (!response.ok) {
    const status = extractStatusCode(payload) ?? response.status;
    const errorMessage = JSON.stringify(payload);
    const error = new Error(errorMessage) as Error & { status?: number };
    error.status = status;
    throw error;
  }

  const choices = payload.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const content = choices?.[0]?.message?.content;
  const text = normalizeContentToText(content).trim();

  if (!text) {
    throw new Error('EMPTY_OPENROUTER_RESPONSE');
  }

  return text;
};

export const extractDTRFromOpenRouterVision = async (
  file: File
): Promise<{ record: DTRRecord; model: string; usedFallback: boolean }> => {
  const dataUrl = await fileToDataUrl(file);
  let seenRateLimit = false;

  for (let index = 0; index < OPENROUTER_VISION_CANDIDATES.length; index += 1) {
    const model = OPENROUTER_VISION_CANDIDATES[index];

    try {
      const content = await callOpenRouter(
        model,
        [
          { role: 'system', content: DTR_QWEN3_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract this DTR image into strict JSON using the required schema.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        2500
      );

      return {
        record: parseGeminiDTR(content),
        model,
        usedFallback: index > 0,
      };
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const message = error instanceof Error ? error.message : String(error);

      if (isRateLimitError(message, status)) {
        seenRateLimit = true;
      }

      if (isVisionUnsupported(message)) {
        continue;
      }

      // Keep trying fallbacks for transient/model-specific issues
      continue;
    }
  }

  if (seenRateLimit) {
    throw new Error(OPENROUTER_RATE_LIMIT_ERROR);
  }

  throw new Error(ALL_MODELS_FAILED_ERROR);
};

export const extractDTRFromOCRTextViaOpenRouter = async (
  ocrText: string
): Promise<{ record: DTRRecord; model: string; usedFallback: boolean }> => {
  let seenRateLimit = false;

  for (let index = 0; index < OPENROUTER_REASONING_CANDIDATES.length; index += 1) {
    const model = OPENROUTER_REASONING_CANDIDATES[index];

    try {
      const content = await callOpenRouter(
        model,
        [
          { role: 'system', content: DTR_QWEN3_PROMPT },
          {
            role: 'user',
            content: `OCR TEXT INPUT:\n\n${ocrText}\n\nReturn strict JSON only.`,
          },
        ],
        2500
      );

      return {
        record: parseGeminiDTR(content),
        model,
        usedFallback: index > 0,
      };
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const message = error instanceof Error ? error.message : String(error);

      if (isRateLimitError(message, status)) {
        seenRateLimit = true;
      }

      continue;
    }
  }

  if (seenRateLimit) {
    throw new Error(OPENROUTER_RATE_LIMIT_ERROR);
  }

  throw new Error(ALL_MODELS_FAILED_ERROR);
};
