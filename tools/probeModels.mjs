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

const apiKey = process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GENAI_API_KEY;
if (!apiKey) {
  console.error('Missing API key. Set REACT_APP_GEMINI_API_KEY in environment or in .env');
  process.exit(1);
}

import { GoogleGenAI } from '@google/genai';

const candidates = [
  { model: 'gemini-flash-latest', apiVersion: 'v1beta' },
  { model: 'gemini-flash-lite-latest', apiVersion: 'v1beta' },
  { model: 'gemini-3-flash-preview', apiVersion: 'v1beta' },
  { model: 'gemini-3-pro-preview', apiVersion: 'v1beta' },
  { model: 'gemini-2.5-flash', apiVersion: 'v1' },
  { model: 'gemini-2.5-flash-lite', apiVersion: 'v1' },
];

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

const run = async () => {
  console.log('Probing Gemini models...');

  for (const candidate of candidates) {
    const { model, apiVersion } = candidate;
    console.log(`\n[probe] ${model} (${apiVersion}) -> attempting lightweight call`);

    const ai = new GoogleGenAI({ apiKey, apiVersion });
    const start = Date.now();

    try {
      // Send a very small prompt asking for a one-word reply to minimize token usage
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

  console.log('\nProbe complete.');
};

run().catch((e) => {
  console.error('Fatal probe error', e);
  process.exit(2);
});
