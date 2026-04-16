# DTR OCR System

A React + TypeScript web app for extracting Daily Time Record data from uploaded images or PDFs with a tri-mode architecture:

- Local Mode: PaddleOCR local server + Qwen3/OpenRouter reasoning
- Free Mode: OpenRouter-only fallback chain
- Legacy Mode: Gemini API compatibility flow

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` in the project root:

```env
REACT_APP_GEMINI_API_KEY=your_api_key_here
REACT_APP_OPENROUTER_API_KEY=your_openrouter_key_here
REACT_APP_LOCAL_OCR_ENDPOINT=http://localhost:5000/ocr
```

3. Install and run Local OCR server (optional, required for Local Mode):

```bash
pip install -r requirements-local-ocr.txt
python ocr_server.py
```

4. Start development server:

```bash
npm start
```

## Main Features

- Multi-file upload queue for split DTR pages (1-15 and 16-30/31)
- Camera capture mode for mobile uploads
- Mode selector (Local / Free / Legacy)
- Sequential processing with per-mode model fallback handling
- Combined DTR merge and totals recalculation
- Result dashboard with:
	- Editable DTR info section
	- Editable full time-entry table with live hour recalculation
	- Live general stats and forecast calculator
	- Export to PDF / Excel
- Local OCR unavailable modal with setup steps
- Rate-limit modal handling (`RATE_LIMIT_HIT`)
- Loading overlay with uploaded-image preview and scan animation

## Build

```bash
npm run build
```

## Testing

```bash
npm test -- --watchAll=false
```
