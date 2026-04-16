import fs from 'fs';

// Load .env if present
try {
  const envText = fs.readFileSync('.env', 'utf8');
  envText.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([^=\s]+)=(.*)$/);
    if (m) {
      const key = m[1];
      let val = m[2] ?? '';
      val = val.replace(/^\s*"|"\s*$/g, '').replace(/^\s*'|'\s*$/g, '').trim();
      if (!process.env[key]) process.env[key] = val;
    }
  });
} catch (e) {
  // ignore
}

const apiKey = process.env.REACT_APP_GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GENAI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Missing API key. Set REACT_APP_GEMINI_API_KEY in environment or in .env');
  process.exit(1);
}

const endpoints = [
  { url: 'https://generativelanguage.googleapis.com/v1/models', label: 'v1' },
  { url: 'https://generativelanguage.googleapis.com/v1beta/models', label: 'v1beta' },
];

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch (e) {
    return { error: 'invalid-json', text: await res.text() };
  }
};

const run = async () => {
  console.log('Listing available models for API key...');

  for (const ep of endpoints) {
    try {
      const url = `${ep.url}?key=${encodeURIComponent(apiKey)}`;
      console.log(`\nRequesting ${ep.label} models from ${ep.url}`);
      const res = await fetch(url, { method: 'GET' });
      const body = await safeJson(res);

      if (!res.ok) {
        console.error(`[${ep.label}] HTTP ${res.status}:`, body);
        continue;
      }

      const models = body.models ?? body; // some responses may return object or array
      if (!Array.isArray(models)) {
        console.log(`[${ep.label}] response:`, JSON.stringify(body, null, 2));
        continue;
      }

      console.log(`[${ep.label}] found ${models.length} models:`);
      for (const m of models) {
        console.log(` - ${m.name || m.id || m.model || '(unknown)'}${m.displayName ? ` — ${m.displayName}` : ''}${m.supportedMethods ? ` — methods: ${m.supportedMethods.join(',')}` : ''}`);
      }
    } catch (err) {
      console.error(`Failed to list models for ${ep.label}:`, String(err));
    }
  }

  console.log('\nDone.');
};

run().catch((e) => {
  console.error('Fatal error', e);
  process.exit(2);
});
