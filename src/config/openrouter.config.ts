export const OPENROUTER_VISION_CANDIDATES = [
  'qwen/qwen3-coder:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
] as const;

export const OPENROUTER_REASONING_CANDIDATES = [
  'qwen/qwen3-coder:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
] as const;

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type OpenRouterModelCandidate = (typeof OPENROUTER_VISION_CANDIDATES)[number];
