import fs from 'node:fs';
import path from 'node:path';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_CHAT_URL = `${OPENROUTER_BASE_URL}/chat/completions`;
const OPENROUTER_MODELS_URL = `${OPENROUTER_BASE_URL}/models`;
const MODEL_CHAIN = [
  'qwen/qwen3-coder:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-3-27b-it:free',
];

const DEFAULT_TINY_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2iP5EAAAAASUVORK5CYII=';

const loadEnvFromDotEnv = () => {
  try {
    const envText = fs.readFileSync('.env', 'utf8');
    envText.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([^=\s]+)=(.*)$/);
      if (!m) return;

      const key = m[1];
      let val = m[2] ?? '';
      val = val.replace(/^\s*"|"\s*$/g, '').replace(/^\s*'|'\s*$/g, '').trim();
      if (!process.env[key]) process.env[key] = val;
    });
  } catch {
    // Ignore missing .env
  }
};

const guessMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
};

const parseImagePathArg = () => {
  const index = process.argv.findIndex((arg) => arg === '--image');
  if (index === -1 || !process.argv[index + 1]) return null;
  return process.argv[index + 1];
};

const buildImageDataUrl = () => {
  const imagePath = parseImagePathArg();
  if (!imagePath) return DEFAULT_TINY_PNG_DATA_URI;

  const imageBuffer = fs.readFileSync(imagePath);
  const mime = guessMimeType(imagePath);
  return `data:${mime};base64,${imageBuffer.toString('base64')}`;
};

const safeJsonParse = (text) => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: text };
  }
};

const probeModel = async ({ apiKey, model, imageDataUrl }) => {
  const start = Date.now();

  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(process.env.OPENROUTER_HTTP_REFERER ? { 'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER } : {}),
      ...(process.env.OPENROUTER_APP_TITLE ? { 'X-OpenRouter-Title': process.env.OPENROUTER_APP_TITLE } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this image and return compact JSON only: {"status":"ok","note":"..."}.',
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 120,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  });

  const elapsedMs = Date.now() - start;
  const raw = await res.text();
  const parsed = safeJsonParse(raw);
  const payload = parsed.value;
  const content = payload?.choices?.[0]?.message?.content;

  return {
    model,
    status: res.status,
    ok: res.ok,
    elapsedMs,
    contentType: res.headers.get('content-type') || '',
    responseText: typeof content === 'string' ? content : null,
    payload,
  };
};

const run = async () => {
  loadEnvFromDotEnv();

  const apiKey = process.env.REACT_APP_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  const wantFullProbe = process.argv.includes('--full');

  if (wantFullProbe && !apiKey) {
    console.error('Missing OpenRouter key for full probe. Set REACT_APP_OPENROUTER_API_KEY in .env or OPENROUTER_API_KEY in environment.');
    process.exitCode = 1;
    return;
  }

  // Connectivity check: GET /models. This verifies the API host and route are reachable.
  const checkApiConnectivity = async (key) => {
    try {
      const headers = { Accept: 'application/json' };
      if (key) headers.Authorization = `Bearer ${key}`;

      const start = Date.now();
      const res = await fetch(OPENROUTER_MODELS_URL, { method: 'GET', headers });
      const elapsedMs = Date.now() - start;
      const text = await res.text();
      const parsed = safeJsonParse(text);
      return { fetchOk: true, status: res.status, statusText: res.statusText, elapsedMs, parsed, contentType: res.headers.get('content-type') };
    } catch (err) {
      return { fetchOk: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const imageDataUrl = buildImageDataUrl();

  console.log('OpenRouter Vision Probe (connectivity-first)');
  console.log(`Models endpoint: ${OPENROUTER_MODELS_URL}`);
  console.log(`Chat endpoint: ${OPENROUTER_CHAT_URL}`);
  console.log(`Models: ${MODEL_CHAIN.join(' -> ')}`);

  const results = [];
  let winner = null;

  // First, perform a lightweight connectivity check against GET /models.
  console.log('\n[connectivity] Checking GET /models (this verifies host + API route)');
  const connectivity = await checkApiConnectivity(apiKey);
  if (!connectivity.fetchOk) {
    console.error('[connectivity] Failed to reach OpenRouter API:', connectivity.error);
    process.exitCode = 1;
    return;
  }

  console.log(`[connectivity] HTTP ${connectivity.status} ${connectivity.statusText} - ${connectivity.elapsedMs}ms`);
  const modelsList = connectivity.parsed.ok
    ? (Array.isArray(connectivity.parsed.value?.models)
        ? connectivity.parsed.value.models
        : Array.isArray(connectivity.parsed.value?.data)
        ? connectivity.parsed.value.data
        : null)
    : null;

  if (Array.isArray(modelsList)) {
    console.log(`[connectivity] OpenRouter reachable — models count: ${modelsList.length}`);
    const sample = modelsList.slice(0, 6).map((m) => m.id || m.model || m.name).filter(Boolean);
    if (sample.length) console.log('[connectivity] Sample models:', sample.join(', '));
  } else if (connectivity.status === 401) {
    console.log('[connectivity] Host reachable but authentication failed (401). Your key may be missing or invalid.');
  } else {
    console.log('[connectivity] Host reachable; response did not parse into expected models list.');
  }

  // If the user only wanted a connectivity check, exit success here.
  if (!wantFullProbe) {
    console.log('\n[connectivity] Success — OpenRouter API is reachable. Use --full to run full model probes.');
    process.exitCode = 0;
    return;
  }

  for (const model of MODEL_CHAIN) {
    console.log(`\n[probe] ${model}`);
    try {
      const result = await probeModel({ apiKey, model, imageDataUrl });
      results.push(result);

      const summary = {
        model: result.model,
        ok: result.ok,
        status: result.status,
        elapsedMs: result.elapsedMs,
        sample: result.responseText ? result.responseText.slice(0, 180) : null,
        error: result.payload?.error || null,
      };
      console.log(summary);

      if (result.ok && result.responseText) {
        winner = result;
        break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorResult = {
        model,
        ok: false,
        status: null,
        elapsedMs: null,
        error: message,
      };
      results.push(errorResult);
      console.log(errorResult);
    }
  }

  console.log('\n=== Fallback Chain Report ===');
  console.log(
    JSON.stringify(
      {
        winner: winner
          ? {
              model: winner.model,
              status: winner.status,
              elapsedMs: winner.elapsedMs,
              responseText: winner.responseText,
            }
          : null,
        attempts: results.map((r) => ({
          model: r.model,
          ok: r.ok,
          status: r.status,
          elapsedMs: r.elapsedMs,
          error: r.payload?.error || r.error || null,
        })),
      },
      null,
      2,
    ),
  );

  if (!winner) {
    process.exit(2);
  }
};

run().catch((err) => {
  console.error('Fatal probe error:', err);
  process.exit(3);
});
