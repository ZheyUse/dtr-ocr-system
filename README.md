# DTR OCR System

A React + TypeScript web app for extracting Daily Time Record data from uploaded images or PDFs with a tri-mode architecture:

- Local Mode: PaddleOCR local server + Qwen3/OpenRouter reasoning
- Free Mode: OpenRouter-only fallback chain
- Legacy Mode: Gemini API compatibility flow

## Quick Start (Fork/Clone)

### 1. Prerequisites

- Node.js 18+ and npm
- Python 3.12 (recommended for Local Mode)

### 2. Clone and install Node dependencies

```bash
git clone ZheyUse/dtr-ocr-system>
cd dtr-ocr-system
npm install
```

### 2.5 One-command local setup (Windows)

If you want the script to install everything for Local Mode (npm + Python venv + OCR dependencies):

```powershell
npm run setup:local
```

To setup and immediately start the Local OCR server:

```powershell
npm run setup:local:start
```

### 3. Create .env in project root

```env
REACT_APP_GEMINI_API_KEY=your_api_key_here
REACT_APP_OPENROUTER_API_KEY=your_openrouter_key_here
REACT_APP_LOCAL_OCR_ENDPOINT=http://localhost:5000/ocr
```

Notes:
- Local Mode needs `REACT_APP_LOCAL_OCR_ENDPOINT` to point to your running local OCR server.
- Free Mode uses OpenRouter key.
- Legacy Mode uses Gemini key.

### Run Locally (Development)

To run the app and the optional local OCR server on your machine you typically need two terminals: one for the PaddleOCR local server (Local Mode) and one for the React frontend.

Windows (PowerShell) — start OCR server then frontend:

```powershell
# 1) create virtualenv (only once)
py -3.12 -m venv .venv-local
.\.venv-local\Scripts\python.exe -m pip install --upgrade pip
.\.venv-local\Scripts\python.exe -m pip install -r requirements-local-ocr.txt

# 2) start the OCR server (keep this terminal open while using Local Mode)
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK='True'
.\.venv-local\Scripts\python.exe .\ocr_server.py

# In a second terminal: start the frontend
npm start
```

macOS / Linux — start OCR server then frontend:

```bash
# 1) create virtualenv (only once)
python3.12 -m venv .venv-local
./.venv-local/bin/python -m pip install --upgrade pip
./.venv-local/bin/python -m pip install -r requirements-local-ocr.txt

# 2) start the OCR server (keep this terminal open while using Local Mode)
PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True ./.venv-local/bin/python ./ocr_server.py

# In a second terminal: start the frontend
npm start
```

Notes and tips:
- Make sure your `.env` contains `REACT_APP_LOCAL_OCR_ENDPOINT=http://localhost:5000/ocr` (or the URL you set) so the frontend knows where to POST images for OCR.
- If you used `npm run setup:local` the script creates the `.venv-local` and installs OCR deps for you; `npm run setup:local:start` will also start the server on Windows.
- The first OCR server startup can take several minutes as Paddle downloads models — keep that terminal open while testing Local Mode.
- Use `Free Mode` from the app if you prefer not to run the local OCR server; that mode uses OpenRouter (requires `REACT_APP_OPENROUTER_API_KEY`).

### 4. Start frontend

```bash
npm start
```

App runs at `http://localhost:3000` by default.

## Local OCR Setup (Optional, required for Local Mode)

Run these commands in `dtr-ocr-system`:

Prefer script-first setup on Windows:

```powershell
npm run setup:local
```

### Windows PowerShell (recommended)

```powershell
py -3.12 -m venv .venv-local
.\.venv-local\Scripts\python.exe -m pip install --upgrade pip
.\.venv-local\Scripts\python.exe -m pip install -r requirements-local-ocr.txt
$env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK='True'
.\.venv-local\Scripts\python.exe .\ocr_server.py
```

### macOS/Linux

```bash
python3.12 -m venv .venv-local
./.venv-local/bin/python -m pip install --upgrade pip
./.venv-local/bin/python -m pip install -r requirements-local-ocr.txt
PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True ./.venv-local/bin/python ./ocr_server.py
```

Health check (optional):

```bash
curl http://127.0.0.1:5000/health
```

Expected response:

```json
{"status":"ok","ocr":"paddleocr-ready"}
```

Notes:
- First Local OCR startup can take a while because Paddle downloads model files.
- Keep the OCR terminal running while using Local Mode.
- Virtual environments are ignored by git (`.venv-local`, `.venv`, `venv`).

## Processing Modes

- Local: Local PaddleOCR extracts text, then Qwen3/OpenRouter structures DTR JSON.
- Free: OpenRouter-only fallback chain.
- Legacy: Gemini compatibility flow.

If Local OCR is not running, use Free or Legacy mode.

## Build

```bash
npm run build
```

## Testing

```bash
npm test -- --watchAll=false
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
