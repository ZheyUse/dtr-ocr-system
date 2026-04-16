export type GeminiModelCandidate = {
  model: string;
  apiVersion: 'v1' | 'v1beta';
};

export const GEMINI_MODEL_CANDIDATES: GeminiModelCandidate[] = [
  // Prefer v1beta preview/latest flash models when available for better OCR quality
  { model: 'gemini-flash-latest', apiVersion: 'v1beta' },
  { model: 'gemini-flash-lite-latest', apiVersion: 'v1beta' },
  { model: 'gemini-3-flash-preview', apiVersion: 'v1beta' },
  { model: 'gemini-3-pro-preview', apiVersion: 'v1beta' },
  // Fall back to stable v1 models
  { model: 'gemini-2.5-flash', apiVersion: 'v1' },
  { model: 'gemini-2.5-flash-lite', apiVersion: 'v1' },
];

export const GEMINI_MAX_OUTPUT_TOKENS = 4096;

export const GEMINI_PROMPT_TEMPLATE = `You are an expert OCR assistant for Philippine government DTR (Daily Time Record) forms.

Analyze this DTR image and extract ALL data precisely. Return ONLY valid JSON matching this exact structure - no markdown, no explanation, just the JSON object:

{
  "employeeName": "",
  "position": "",
  "department": "",
  "month": "",
  "salaryGrade": "",
  "stepIncrement": "",
  "entries": [
    {
      "date": "YYYY-MM-DD",
      "dayOfWeek": "",
      "amIn": "HH:MM or null",
      "amOut": "HH:MM or null",
      "pmIn": "HH:MM or null",
      "pmOut": "HH:MM or null",
      "totalHours": 0,
      "undertime": 0,
      "remarks": ""
    }
  ],
  "totalDaysPresent": 0,
  "totalHoursRendered": 0
}

Rules:
- Use null for any missing time value
- totalHours per entry = (amOut - amIn) + (pmOut - pmIn) in decimal hours
- remarks: "Present", "Absent", "Holiday", "Rest Day", or ""
- Return entries for ALL days shown, including rest days with null times
- Do NOT invent data - if a field is illegible, use "" or null`;

export const GEMINI_OCR_TEXT_PROMPT_TEMPLATE = `You are an expert OCR assistant for Philippine government DTR (Daily Time Record) forms.

You will receive OCR output (canonical JSON and raw text) from a local PaddleOCR pipeline.
Use that OCR data to reconstruct and return ONLY valid JSON matching this exact structure:

{
  "employeeName": "",
  "position": "",
  "department": "",
  "month": "",
  "salaryGrade": "",
  "stepIncrement": "",
  "entries": [
    {
      "date": "YYYY-MM-DD",
      "dayOfWeek": "",
      "amIn": "HH:MM or null",
      "amOut": "HH:MM or null",
      "pmIn": "HH:MM or null",
      "pmOut": "HH:MM or null",
      "totalHours": 0,
      "undertime": 0,
      "remarks": ""
    }
  ],
  "totalDaysPresent": 0,
  "totalHoursRendered": 0
}

Rules:
- Use null for missing time values
- Prefer OCR canonical JSON as source of truth for row alignment and confidence
- Use OCR raw text only as fallback context
- totalHours per entry = (amOut - amIn) + (pmOut - pmIn) in decimal hours
- remarks: "Present", "Absent", "Holiday", "Rest Day", or ""
- Return entries for all visible days
- Do not invent data; if unclear, use "" or null
- Return JSON only (no markdown, no explanation)`;