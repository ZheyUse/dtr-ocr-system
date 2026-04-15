# DTR OCR System

A React + TypeScript web app for extracting Daily Time Record data from uploaded images or PDFs using Gemini Flash.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` in the project root:

```env
REACT_APP_GEMINI_API_KEY=your_api_key_here
```

3. Start development server:

```bash
npm start
```

## Main Features

- Multi-file upload queue for split DTR pages (1-15 and 16-30/31)
- Camera capture mode for mobile uploads
- Sequential Gemini processing (rate-limit friendly)
- Combined DTR merge and totals recalculation
- Result dashboard with:
	- DTR info section
	- Full time-entry table
	- Live general stats and forecast calculator
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
