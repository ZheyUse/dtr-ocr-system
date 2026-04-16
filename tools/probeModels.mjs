import fs from 'fs';

// Try to load .env manually (so node can pick up the REACT_APP_GEMINI_API_KEY if present)
try {
  const envText = fs.readFileSync('.env', 'utf8');
  envText.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([^=\s]+)=(.*)$/);
    if (m) {
      const key = m[1];
      let val = m[2] ?? '';
      // strip surrounding quotes
      val = val.replace(/^\s*"|"\s*$/g, '').replace(/^\s*'|'\s*$/g, '').trim();
      if (!process.env[key]) process.env[key] = val;
    }
  });
} catch (e) {
  // ignore if no .env
}

// Support probing both Gemini (Google GenAI) and OpenRouter/Qwen models
const geminiApiKey = process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GENAI_API_KEY;
const openRouterApiKey = process.env.REACT_APP_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;

import { GoogleGenAI } from '@google/genai';

const geminiCandidates = [
  { model: 'gemini-flash-latest', apiVersion: 'v1beta' },
  { model: 'gemini-flash-lite-latest', apiVersion: 'v1beta' },
  { model: 'gemini-3-flash-preview', apiVersion: 'v1beta' },
  { model: 'gemini-3-pro-preview', apiVersion: 'v1beta' },
  { model: 'gemini-2.5-flash', apiVersion: 'v1' },
  { model: 'gemini-2.5-flash-lite', apiVersion: 'v1' },
];

// OpenRouter/Qwen model candidates to try via the OpenRouter API
const qwenCandidates = [
  { model: 'qwen/qwen3-coder:free' },
  { model: 'qwen/qwen3-32b:free' },
  { model: 'qwen/qwen3-235b-a22b:free' },
  { model: 'qwen/qwq-32b:free' },
  { model: 'qwen/qwen3-32b' },
];

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

const safeSerialize = (err) => {
  try {
    if (!err) return null;
    if (err instanceof Error) {
      const out = { name: err.name, message: err.message, stack: err.stack };
      try { Object.assign(out, err); } catch {}
      return out;
    }
    return JSON.parse(JSON.stringify(err));
  } catch (e) {
    return String(err);
  }
};

const openRouterHeaders = () => ({
  Authorization: `Bearer ${openRouterApiKey}`,
  'Content-Type': 'application/json',
  // Optional attribution headers supported by OpenRouter docs
  ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
  ...(process.env.OPENROUTER_APP_TITLE ? { 'X-OpenRouter-Title': process.env.OPENROUTER_APP_TITLE } : {}),
});

const isHtmlPayload = (payload) => {
  if (typeof payload !== 'string') return false;
  const head = payload.trim().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
};

const openRouterRequest = async (path, init = {}, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    return {
      ok: res.ok,
      status: res.status,
      contentType,
      body,
      rawText: text,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const run = async () => {
  console.log('Starting model probes...');

  // Probe Gemini (Google GenAI) candidates if a Gemini API key is available
  if (geminiApiKey) {
    console.log('\nProbing Gemini models...');

    for (const candidate of geminiCandidates) {
      const { model, apiVersion } = candidate;
      console.log(`\n[probe] ${model} (${apiVersion}) -> attempting lightweight call`);

      const ai = new GoogleGenAI({ apiKey: geminiApiKey, apiVersion });
      const start = Date.now();

      try {
        const response = await ai.models.generateContent({
          model,
          contents: ['Ping. Reply with "OK" only.'],
          config: {
            temperature: 0,
            maxOutputTokens: 8,
          },
        });

        const elapsed = Date.now() - start;
        const textPresent = Boolean(response?.text);
        const partsCount = Array.isArray(response?.parts) ? response.parts.length : undefined;

        console.log('[ok]', { model, apiVersion, elapsedMs: elapsed, textPresent, partsCount, sampleText: response?.text?.slice?.(0, 200) });
      } catch (err) {
        const elapsed = Date.now() - start;
        console.error('[error]', { model, apiVersion, elapsedMs: elapsed, error: safeSerialize(err) });
      }
    }
  } else {
    console.log('\nSkipping Gemini probe (no Gemini/Google API key).');
  }

  // Probe Qwen via OpenRouter if an OpenRouter key is present
  if (openRouterApiKey) {
    console.log('\nProbing OpenRouter / Qwen candidates...');

    // 1) Connectivity + model discovery from official endpoint
    console.log(`[openrouter] baseURL=${OPENROUTER_BASE_URL}`);
    const modelsStart = Date.now();
    let discoveredQwenModels = [];

    try {
      const modelsResponse = await openRouterRequest('/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${openRouterApiKey}`,
        },
      });

      const modelsElapsed = Date.now() - modelsStart;
      if (!modelsResponse.ok) {
        console.error('[openrouter-models-error]', {
          status: modelsResponse.status,
          elapsedMs: modelsElapsed,
          contentType: modelsResponse.contentType,
          body: modelsResponse.body,
        });
      } else if (isHtmlPayload(modelsResponse.rawText)) {
        console.error('[openrouter-models-error]', {
          elapsedMs: modelsElapsed,
          message: 'Received HTML instead of JSON from /models. Check base URL / proxy / DNS.',
          sample: modelsResponse.rawText.slice(0, 160),
        });
      } else {
        const allModels = Array.isArray(modelsResponse.body?.data) ? modelsResponse.body.data : [];
        discoveredQwenModels = allModels
          .map((m) => m?.id)
          .filter((id) => typeof id === 'string' && /(qwen|qwq)/i.test(id));

        const discoveredFreeQwenModels = discoveredQwenModels.filter((id) => id.includes(':free'));

        console.log('[openrouter-models-ok]', {
          elapsedMs: modelsElapsed,
          totalModels: allModels.length,
          qwenModelsFound: discoveredQwenModels.length,
          qwenFreeModelsFound: discoveredFreeQwenModels.length,
          sampleQwen: discoveredQwenModels.slice(0, 8),
          sampleQwenFree: discoveredFreeQwenModels.slice(0, 8),
        });
      }
    } catch (err) {
      console.error('[openrouter-models-exception]', { error: safeSerialize(err) });
    }

    const discoveredFreeQwenModels = discoveredQwenModels.filter((id) => id.includes(':free'));
    const discoveredPaidQwenModels = discoveredQwenModels.filter((id) => !id.includes(':free'));
    const fallbackQwenModels = qwenCandidates.map((c) => c.model);
    const preferredFreeModel = 'qwen/qwen3-coder:free';
    const prioritizedDiscoveredFreeQwenModels = [
      ...discoveredFreeQwenModels.filter((id) => id === preferredFreeModel),
      ...discoveredFreeQwenModels.filter((id) => id !== preferredFreeModel),
    ];

    const qwenProbeModels = (
      discoveredQwenModels.length
        ? [...prioritizedDiscoveredFreeQwenModels, ...discoveredPaidQwenModels]
        : fallbackQwenModels
    ).slice(0, 6);

    for (const candidate of qwenProbeModels) {
      const model = typeof candidate === 'string' ? candidate : candidate.model;
      console.log(`\n[probe-openrouter] ${model} -> attempting lightweight call`);
      const start = Date.now();

      try {
        const payload = {
          model,
          messages: [{ role: 'user', content: 'Ping. Reply with "OK" only.' }],
          temperature: 0,
          max_tokens: 8,
        };

        const response = await openRouterRequest('/chat/completions', {
          method: 'POST',
          headers: openRouterHeaders(),
          body: JSON.stringify(payload),
        });

        const elapsed = Date.now() - start;
        if (!response.ok) {
          console.error('[openrouter-error]', {
            model,
            status: response.status,
            elapsedMs: elapsed,
            contentType: response.contentType,
            body: response.body,
          });
        } else if (isHtmlPayload(response.rawText)) {
          console.error('[openrouter-error]', {
            model,
            elapsedMs: elapsed,
            message: 'Received HTML instead of JSON from chat endpoint.',
            sample: response.rawText.slice(0, 160),
          });
        } else {
          const text = response.body?.choices?.[0]?.message?.content
            || response.body?.choices?.[0]?.text
            || JSON.stringify(response.body).slice(0, 200);

          console.log('[ok-openrouter]', {
            model,
            elapsedMs: elapsed,
            sampleText: text,
            usage: response.body?.usage,
          });
        }
      } catch (err) {
        console.error('[openrouter-exception]', { model, error: safeSerialize(err) });
      }
    }
  } else {
    console.log('\nSkipping OpenRouter probe (no OpenRouter API key).');
  }

  console.log('\nProbe complete.');
};

run().catch((e) => {
  console.error('Fatal probe error', e);
  process.exit(2);
});
