export const GEMINI_PRIMARY_MODEL = 'gemini-2.0-flash';
export const GEMINI_FALLBACK_MODEL = 'gemini-1.5-flash';
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