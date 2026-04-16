import os
import sys
import logging
import traceback
import time
import re
from datetime import date
from typing import Dict, Any, List, Optional, Tuple
from importlib import metadata as importlib_md

# Disable MKLDNN / oneDNN conversions by default to avoid
# ConvertPirAttribute2RuntimeAttribute errors in some Paddle builds.
# This must be set before importing Paddle/PaddleOCR.
os.environ['FLAGS_use_mkldnn'] = '0'
# Prefer Paddle logs to stderr so they appear in the console
os.environ.setdefault('GLOG_logtostderr', '1')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import base64
import cv2
import numpy as np

# Configure minimal logging for the server and debug output
logging.basicConfig(
    level=logging.DEBUG,
    format='[%(asctime)s] %(levelname)s %(name)s: %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger('ocr_server')

# Log environment and runtime info early for debugging
logger.debug('Starting OCR server - dumping environment and runtime info')
logger.debug('Python executable: %s', sys.executable)
logger.debug('Python version: %s', sys.version.replace('\n', ' '))
keys = ['FLAGS_use_mkldnn', 'PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK', 'LOCAL_OCR_PORT', 'PATH']
for k in keys:
    logger.debug('ENV %s=%r', k, os.environ.get(k))

pkgs = ['paddlepaddle', 'paddleocr', 'paddlex', 'numpy']
for p in pkgs:
    try:
        v = importlib_md.version(p)
    except Exception:
        v = None
    logger.debug('pkg %s => %s', p, v)

# Defer PaddleOCR import/initialization so we can add detailed error handling
try:
    logger.debug('Importing paddle and paddleocr for version checks...')
    import paddle
    import paddleocr
    logger.debug('paddle version: %s', getattr(paddle, '__version__', 'unknown'))
    logger.debug('paddleocr version: %s', getattr(paddleocr, '__version__', 'unknown'))
except Exception:
    logger.exception('Failed to import paddle/paddleocr packages')


def get_env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {'1', 'true', 'yes', 'on'}


def detect_ocr_runtime() -> Dict[str, Any]:
    force_gpu = get_env_bool('LOCAL_OCR_FORCE_GPU', False)
    force_cpu = get_env_bool('LOCAL_OCR_FORCE_CPU', False)

    gpu_compiled = False
    gpu_count = 0
    try:
        gpu_compiled = bool(paddle.device.is_compiled_with_cuda())
        if gpu_compiled:
            gpu_count = int(paddle.device.cuda.device_count())
    except Exception:
        logger.exception('Unable to query CUDA capability from Paddle runtime')

    use_gpu = (gpu_compiled and gpu_count > 0) or force_gpu
    if force_cpu:
        use_gpu = False

    cpu_count = os.cpu_count() or 2
    default_threads = min(max(2, cpu_count), 8)
    try:
        cpu_threads = int(os.environ.get('LOCAL_OCR_CPU_THREADS', str(default_threads)))
    except Exception:
        cpu_threads = default_threads
    cpu_threads = max(1, cpu_threads)

    fast_mode = get_env_bool('LOCAL_OCR_FAST_MODE', True)
    use_doc_orientation = get_env_bool('LOCAL_OCR_DOC_ORIENTATION', False)
    use_doc_unwarping = get_env_bool('LOCAL_OCR_DOC_UNWARPING', False)
    use_textline_orientation = get_env_bool('LOCAL_OCR_TEXTLINE_ORIENTATION', True)

    runtime = {
        'use_gpu': use_gpu,
        'gpu_compiled': gpu_compiled,
        'gpu_count': gpu_count,
        'cpu_threads': cpu_threads,
        'fast_mode': fast_mode,
        'use_doc_orientation_classify': use_doc_orientation,
        'use_doc_unwarping': use_doc_unwarping,
        'use_textline_orientation': use_textline_orientation,
        'force_gpu': force_gpu,
        'force_cpu': force_cpu,
    }

    if gpu_compiled and gpu_count == 0 and not force_cpu:
        logger.warning(
            'Paddle is CUDA-capable but no GPU devices were detected. Falling back to CPU.'
        )
    if not gpu_compiled and force_gpu:
        logger.warning(
            'LOCAL_OCR_FORCE_GPU is enabled but installed Paddle is CPU-only. Falling back to CPU.'
        )

    return runtime


OCR_RUNTIME: Dict[str, Any] = {}

try:
    logger.info('Initializing PaddleOCR (this may download/cache models)...')
    from paddleocr import PaddleOCR
    OCR_RUNTIME = detect_ocr_runtime()
    logger.info('OCR runtime selection: %s', OCR_RUNTIME)
    runtime_device = 'gpu:0' if OCR_RUNTIME['use_gpu'] else 'cpu'

    paddleocr_kwargs = {
        'lang': 'en',
        # Keep mkldnn disabled by default to avoid ConvertPirAttribute errors.
        'enable_mkldnn': False,
        'cpu_threads': OCR_RUNTIME['cpu_threads'],
        'device': runtime_device,
        'use_doc_orientation_classify': OCR_RUNTIME['use_doc_orientation_classify'],
        'use_doc_unwarping': OCR_RUNTIME['use_doc_unwarping'],
        'use_textline_orientation': OCR_RUNTIME['use_textline_orientation'],
    }

    # Fast mode trims expensive preprocessing for faster throughput.
    if OCR_RUNTIME['fast_mode']:
        paddleocr_kwargs['text_det_limit_side_len'] = int(os.environ.get('LOCAL_OCR_DET_LIMIT', '960'))

    ocr = PaddleOCR(**paddleocr_kwargs)
    logger.info('PaddleOCR initialized successfully')
except Exception as e:
    logger.exception('PaddleOCR initialization failed: %s', e)
    # Re-raise so the server doesn't start silently in a broken state
    raise

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ImageRequest(BaseModel):
    image: str


MONTH_NAME_MAP = {
    'JAN': 1,
    'JANUARY': 1,
    'FEB': 2,
    'FEBRUARY': 2,
    'MAR': 3,
    'MARCH': 3,
    'APR': 4,
    'APRIL': 4,
    'MAY': 5,
    'JUN': 6,
    'JUNE': 6,
    'JUL': 7,
    'JULY': 7,
    'AUG': 8,
    'AUGUST': 8,
    'SEP': 9,
    'SEPT': 9,
    'SEPTEMBER': 9,
    'OCT': 10,
    'OCTOBER': 10,
    'NOV': 11,
    'NOVEMBER': 11,
    'DEC': 12,
    'DECEMBER': 12,
}

MONTH_NAME_RE = re.compile(r'\b(' + '|'.join(MONTH_NAME_MAP.keys()) + r')\b', re.IGNORECASE)
YEAR_RE = re.compile(r'\b(20\d{2})\b')
ISO_DATE_RE = re.compile(r'\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b')
SLASH_DATE_RE = re.compile(r'\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b')
ROW_DAY_RE = re.compile(r'^\s*(\d{1,2})(?:\s|\b)')
TIME_TOKEN_RE = re.compile(
    r'\b((?:[01]?\d|2[0-3]):[0-5]\d(?:\s?(?:AM|PM|A\.M\.|P\.M\.))?|(?:0?[1-9]|1[0-2])(?::[0-5]\d)?\s?(?:AM|PM|A\.M\.|P\.M\.))\b',
    re.IGNORECASE,
)


def normalize_whitespace(value: str) -> str:
    return re.sub(r'\s+', ' ', value or '').strip()


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def normalize_polygon(poly: Any) -> List[List[float]]:
    if not isinstance(poly, (list, tuple)):
        return []

    out: List[List[float]] = []
    for pt in poly:
        if not isinstance(pt, (list, tuple)) or len(pt) < 2:
            continue
        out.append([to_float(pt[0]), to_float(pt[1])])
    return out


def polygon_to_bbox(poly: Any) -> Tuple[Optional[List[List[float]]], Dict[str, float]]:
    points = normalize_polygon(poly)
    if not points:
        return None, {'x': 0.0, 'y': 0.0, 'w': 0.0, 'h': 0.0}

    xs = [pt[0] for pt in points]
    ys = [pt[1] for pt in points]
    min_x = min(xs)
    max_x = max(xs)
    min_y = min(ys)
    max_y = max(ys)
    return points, {
        'x': float(min_x),
        'y': float(min_y),
        'w': float(max_x - min_x),
        'h': float(max_y - min_y),
    }


def flatten_ocr_lines(result: Any) -> List[Dict[str, Any]]:
    lines: List[Dict[str, Any]] = []

    if not isinstance(result, list):
        return lines

    for page_index, page in enumerate(result):
        if isinstance(page, dict):
            texts = page.get('rec_texts') or []
            scores = page.get('rec_scores') or []
            polys = page.get('rec_polys') or page.get('dt_polys') or page.get('textline_polys') or []

            for idx, raw_text in enumerate(texts):
                if not isinstance(raw_text, str):
                    continue

                text = normalize_whitespace(raw_text)
                if not text:
                    continue

                confidence = to_float(scores[idx] if idx < len(scores) else 1.0, 0.0)
                polygon, box = polygon_to_bbox(polys[idx] if idx < len(polys) else None)
                lines.append(
                    {
                        'page': page_index,
                        'text': text,
                        'confidence': confidence,
                        'polygon': polygon,
                        'x': box['x'],
                        'y': box['y'],
                        'w': box['w'],
                        'h': box['h'],
                    }
                )
            continue

        if isinstance(page, list):
            for row in page:
                if not isinstance(row, (list, tuple)) or len(row) < 2:
                    continue

                poly = row[0] if len(row) > 0 else None
                text_conf = row[1]
                if not isinstance(text_conf, (list, tuple)) or len(text_conf) < 1:
                    continue

                raw_text = text_conf[0]
                if not isinstance(raw_text, str):
                    continue

                text = normalize_whitespace(raw_text)
                if not text:
                    continue

                confidence = to_float(text_conf[1] if len(text_conf) > 1 else 1.0, 0.0)
                polygon, box = polygon_to_bbox(poly)
                lines.append(
                    {
                        'page': page_index,
                        'text': text,
                        'confidence': confidence,
                        'polygon': polygon,
                        'x': box['x'],
                        'y': box['y'],
                        'w': box['w'],
                        'h': box['h'],
                    }
                )

    lines.sort(key=lambda item: (item['page'], item['y'], item['x']))
    return lines


def to_canonical_ocr_json(flat_lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    pages: Dict[int, List[Dict[str, Any]]] = {}
    confidences: List[float] = []

    for line in flat_lines:
        page_idx = int(line['page'])
        pages.setdefault(page_idx, []).append(
            {
                'text': line['text'],
                'confidence': round(float(line['confidence']), 4),
                'bbox': line['polygon'],
                'rect': {
                    'x': round(float(line['x']), 2),
                    'y': round(float(line['y']), 2),
                    'w': round(float(line['w']), 2),
                    'h': round(float(line['h']), 2),
                },
            }
        )
        confidences.append(float(line['confidence']))

    ordered_pages = []
    for page_idx in sorted(pages.keys()):
        ordered_pages.append({'pageIndex': page_idx, 'lines': pages[page_idx]})

    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
    return {
        'schemaVersion': '1.0',
        'pages': ordered_pages,
        'stats': {
            'lineCount': len(flat_lines),
            'avgConfidence': round(avg_conf, 4),
        },
    }


def parse_time_to_24h(token: str) -> Optional[str]:
    if not token:
        return None

    normalized = token.upper().replace('.', '').strip()
    meridiem = None
    if normalized.endswith('AM'):
        meridiem = 'AM'
        normalized = normalized[:-2].strip()
    elif normalized.endswith('PM'):
        meridiem = 'PM'
        normalized = normalized[:-2].strip()

    if ':' in normalized:
        parts = normalized.split(':', 1)
        if len(parts) != 2:
            return None
        hour_raw, minute_raw = parts[0], parts[1]
    else:
        hour_raw, minute_raw = normalized, '00'

    if not hour_raw.isdigit() or not minute_raw.isdigit():
        return None

    hour = int(hour_raw)
    minute = int(minute_raw)
    if minute < 0 or minute > 59:
        return None

    if meridiem:
        if hour < 1 or hour > 12:
            return None
        if meridiem == 'AM':
            hour = 0 if hour == 12 else hour
        else:
            hour = 12 if hour == 12 else hour + 12
    else:
        if hour < 0 or hour > 23:
            return None

    return f'{hour:02d}:{minute:02d}'


def parse_line_times(text: str) -> List[str]:
    times: List[str] = []
    for match in TIME_TOKEN_RE.finditer(text):
        parsed = parse_time_to_24h(match.group(1))
        if parsed:
            times.append(parsed)
    return times[:4]


def infer_month_year_from_lines(flat_lines: List[Dict[str, Any]]) -> Tuple[Optional[int], Optional[int]]:
    month_counts: Dict[int, int] = {}
    year_counts: Dict[int, int] = {}

    for line in flat_lines:
        text = line['text']
        month_match = MONTH_NAME_RE.search(text)
        if month_match:
            month_idx = MONTH_NAME_MAP.get(month_match.group(1).upper())
            if month_idx:
                month_counts[month_idx] = month_counts.get(month_idx, 0) + 1

        for year_match in YEAR_RE.finditer(text):
            year_value = int(year_match.group(1))
            year_counts[year_value] = year_counts.get(year_value, 0) + 1

    month = max(month_counts.items(), key=lambda kv: kv[1])[0] if month_counts else None
    year = max(year_counts.items(), key=lambda kv: kv[1])[0] if year_counts else None
    return month, year


def build_iso_date(year: int, month: int, day: int) -> Optional[str]:
    try:
        return date(year, month, day).isoformat()
    except Exception:
        return None


def extract_row_date(text: str, inferred_month: Optional[int], inferred_year: Optional[int]) -> Optional[str]:
    iso_match = ISO_DATE_RE.search(text)
    if iso_match:
        year = int(iso_match.group(1))
        month = int(iso_match.group(2))
        day = int(iso_match.group(3))
        return build_iso_date(year, month, day)

    slash_match = SLASH_DATE_RE.search(text)
    if slash_match:
        month = int(slash_match.group(1))
        day = int(slash_match.group(2))
        year = int(slash_match.group(3))
        return build_iso_date(year, month, day)

    if inferred_month and inferred_year:
        row_day_match = ROW_DAY_RE.search(text)
        if row_day_match:
            day = int(row_day_match.group(1))
            return build_iso_date(inferred_year, inferred_month, day)

    return None


def to_minutes(hhmm: Optional[str]) -> Optional[int]:
    if not hhmm or not isinstance(hhmm, str):
        return None
    if ':' not in hhmm:
        return None
    hour_raw, minute_raw = hhmm.split(':', 1)
    if not hour_raw.isdigit() or not minute_raw.isdigit():
        return None
    hour = int(hour_raw)
    minute = int(minute_raw)
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return hour * 60 + minute


def hours_between(start: Optional[int], end: Optional[int]) -> float:
    if start is None or end is None or end <= start:
        return 0.0
    return (end - start) / 60.0


def compute_total_hours(am_in: Optional[str], am_out: Optional[str], pm_in: Optional[str], pm_out: Optional[str]) -> float:
    am_in_m = to_minutes(am_in)
    am_out_m = to_minutes(am_out)
    pm_in_m = to_minutes(pm_in)
    pm_out_m = to_minutes(pm_out)

    if pm_in_m is not None and am_out_m is not None and pm_in_m < am_out_m and pm_in_m + 12 * 60 <= 23 * 60 + 59:
        pm_in_m += 12 * 60

    if pm_out_m is not None and pm_in_m is not None and pm_out_m <= pm_in_m and pm_out_m + 12 * 60 <= 23 * 60 + 59:
        pm_out_m += 12 * 60

    total = hours_between(am_in_m, am_out_m) + hours_between(pm_in_m, pm_out_m)
    return round(total, 2)


def infer_remarks(raw_text: str, total_hours: float) -> str:
    lower = raw_text.lower()
    if 'absent' in lower:
        return 'Absent'
    if 'holiday' in lower:
        return 'Holiday'
    if 'rest day' in lower or 'restday' in lower:
        return 'Rest Day'
    if total_hours > 0:
        return 'Present'
    return ''


def extract_header_field(flat_lines: List[Dict[str, Any]], label: str) -> str:
    regex = re.compile(rf'{label}\s*[:\-]\s*(.+)$', re.IGNORECASE)
    for line in flat_lines:
        text = line['text']
        match = regex.search(text)
        if match:
            return normalize_whitespace(match.group(1))
    return ''


def derive_month_label(entries: List[Dict[str, Any]]) -> str:
    if not entries:
        return ''
    try:
        first_date = entries[0]['date']
        parsed = date.fromisoformat(first_date)
        return parsed.strftime('%B').upper()
    except Exception:
        return ''


def build_structured_dtr(flat_lines: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    inferred_month, inferred_year = infer_month_year_from_lines(flat_lines)
    rows_by_date: Dict[str, Dict[str, Any]] = {}
    used_line_confidences: List[float] = []

    for line in flat_lines:
        text = line['text']
        row_date = extract_row_date(text, inferred_month, inferred_year)
        if not row_date:
            continue

        times = parse_line_times(text)
        if not times:
            continue

        row = rows_by_date.get(row_date)
        if not row:
            row = {
                'date': row_date,
                'dayOfWeek': '',
                'amIn': None,
                'amOut': None,
                'pmIn': None,
                'pmOut': None,
                'totalHours': 0.0,
                'undertime': 0,
                'remarks': '',
                '_conf': 0.0,
            }
            rows_by_date[row_date] = row

        fields = ['amIn', 'amOut', 'pmIn', 'pmOut']
        for idx, value in enumerate(times):
            if idx >= len(fields):
                break
            field = fields[idx]
            if row[field] is None:
                row[field] = value

        row['_conf'] = max(float(row['_conf']), float(line['confidence']))
        row['totalHours'] = compute_total_hours(row['amIn'], row['amOut'], row['pmIn'], row['pmOut'])
        row['remarks'] = infer_remarks(text, row['totalHours'])
        used_line_confidences.append(float(line['confidence']))

    entries = []
    for row_date in sorted(rows_by_date.keys()):
        row = rows_by_date[row_date]
        try:
            day_of_week = date.fromisoformat(row_date).strftime('%A')
        except Exception:
            day_of_week = ''
        entries.append(
            {
                'date': row_date,
                'dayOfWeek': day_of_week,
                'amIn': row['amIn'],
                'amOut': row['amOut'],
                'pmIn': row['pmIn'],
                'pmOut': row['pmOut'],
                'totalHours': round(float(row['totalHours']), 2),
                'undertime': 0,
                'remarks': row['remarks'],
            }
        )

    total_hours = round(sum(float(item['totalHours']) for item in entries), 2)
    total_days_present = sum(1 for item in entries if float(item['totalHours']) > 0 or item['remarks'] == 'Present')
    avg_conf = sum(used_line_confidences) / len(used_line_confidences) if used_line_confidences else 0.0

    heuristic_confidence = 0.0
    if entries:
        heuristic_confidence = min(0.98, 0.35 + 0.03 * len(entries) + 0.3 * avg_conf)

    should_use_llm = len(entries) < 8 or heuristic_confidence < 0.72

    parser_meta = {
        'parser': 'heuristic-v1',
        'entryCount': len(entries),
        'avgMatchedLineConfidence': round(avg_conf, 4),
        'confidence': round(heuristic_confidence, 4),
        'shouldUseLLM': should_use_llm,
    }

    if not entries:
        return None, parser_meta

    record = {
        'employeeName': extract_header_field(flat_lines, 'employee(?:\\s*name)?'),
        'position': extract_header_field(flat_lines, 'position'),
        'department': extract_header_field(flat_lines, 'department(?:\\s*/\\s*office)?'),
        'month': derive_month_label(entries),
        'salaryGrade': extract_header_field(flat_lines, 'salary\\s*grade'),
        'stepIncrement': extract_header_field(flat_lines, 'step\\s*increment'),
        'entries': entries,
        'totalDaysPresent': total_days_present,
        'totalHoursRendered': total_hours,
    }

    return record, parser_meta


def preprocess_image_for_ocr(img: np.ndarray) -> np.ndarray:
    max_side = int(os.environ.get('OCR_MAX_SIDE', '2200'))
    if img is None:
        return img

    h, w = img.shape[:2]
    largest_side = max(h, w)
    if largest_side <= max_side:
        return img

    scale = max_side / float(largest_side)
    resized = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    logger.debug(
        'Resized input image for OCR: original=%sx%s resized=%sx%s max_side=%s',
        w,
        h,
        resized.shape[1],
        resized.shape[0],
        max_side,
    )
    return resized


def decode_base64_image(base64_str: str):
    if "," in base64_str:
        base64_str = base64_str.split(",", 1)[1]

    img_data = base64.b64decode(base64_str)
    np_arr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    return img


def clean_ocr_result(result):
    if not result:
        return ""

    lines = []

    # PaddleOCR v3 returns a list of dicts that contains `rec_texts` and
    # `rec_scores`, while older versions used nested list tuples.
    for page in result:
        if isinstance(page, dict):
            texts = page.get('rec_texts') or []
            scores = page.get('rec_scores') or []

            for idx, text in enumerate(texts):
                if not isinstance(text, str):
                    continue

                score = scores[idx] if idx < len(scores) else 1.0
                try:
                    confidence = float(score)
                except Exception:
                    confidence = 0.0

                if confidence > 0.5 and text.strip():
                    lines.append(text.strip())
            continue

        if isinstance(page, list):
            for line in page:
                if not isinstance(line, (list, tuple)) or len(line) < 2:
                    continue

                text_conf = line[1]
                if not isinstance(text_conf, (list, tuple)) or not text_conf:
                    continue

                text = text_conf[0]
                score = text_conf[1] if len(text_conf) > 1 else 1.0

                if not isinstance(text, str):
                    continue

                try:
                    confidence = float(score)
                except Exception:
                    confidence = 0.0

                if confidence > 0.5 and text.strip():
                    lines.append(text.strip())

    # Preserve order while removing duplicates.
    deduped = list(dict.fromkeys(lines))
    return "\n".join(deduped)


@app.post("/ocr")
async def extract_text(request: ImageRequest):
    started_at = time.perf_counter()
    try:
        logger.debug('POST /ocr received (base64_length=%d)', len(request.image or ''))
        img = decode_base64_image(request.image)
        if img is None:
            raise ValueError('Image decode failed (cv2.imdecode returned None)')

        img = preprocess_image_for_ocr(img)
        logger.debug('Decoded image shape=%s dtype=%s', getattr(img, 'shape', None), getattr(img, 'dtype', None))

        # Newer PaddleOCR versions handle textline orientation via the
        # `use_textline_orientation` constructor flag. Avoid passing the
        # now-unsupported `cls` keyword to `ocr()`/`predict()`.
        result = ocr.ocr(img)
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.debug('OCR inference finished in %dms', elapsed_ms)

        first_type = type(result[0]).__name__ if result else None
        logger.debug('OCR result schema: container=%s first_item=%s', type(result).__name__, first_type)

        if not result:
            logger.warning('OCR returned no result content')
            return {
                "success": False,
                "text": "",
                "error": "NO_TEXT_DETECTED",
                "ocr_json": {
                    'schemaVersion': '1.0',
                    'pages': [],
                    'stats': {'lineCount': 0, 'avgConfidence': 0.0},
                },
                "structured_dtr": None,
                "structured_meta": {
                    'parser': 'heuristic-v1',
                    'entryCount': 0,
                    'avgMatchedLineConfidence': 0.0,
                    'confidence': 0.0,
                    'shouldUseLLM': True,
                },
            }

        flat_lines = flatten_ocr_lines(result)
        text = clean_ocr_result(result)
        ocr_json = to_canonical_ocr_json(flat_lines)
        structured_dtr, structured_meta = build_structured_dtr(flat_lines)
        logger.debug('OCR text length=%d', len(text))
        logger.debug(
            'Structured parser meta: entryCount=%s confidence=%.4f shouldUseLLM=%s',
            structured_meta.get('entryCount'),
            float(structured_meta.get('confidence', 0.0)),
            bool(structured_meta.get('shouldUseLLM', True)),
        )

        return {
            "success": True,
            "text": text,
            "ocr_json": ocr_json,
            "structured_dtr": structured_dtr,
            "structured_meta": structured_meta,
        }

    except Exception as e:
        logger.exception('OCR request failed: %s', e)
        logger.debug('OCR traceback:\n%s', traceback.format_exc())
        return {
            "success": False,
            "text": "",
            "error": str(e),
        }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "ocr": "paddleocr-ready",
        "runtime": {
            "use_gpu": OCR_RUNTIME.get('use_gpu', False),
            "device": 'gpu:0' if OCR_RUNTIME.get('use_gpu', False) else 'cpu',
            "gpu_compiled": OCR_RUNTIME.get('gpu_compiled', False),
            "gpu_count": OCR_RUNTIME.get('gpu_count', 0),
            "cpu_threads": OCR_RUNTIME.get('cpu_threads', 1),
            "fast_mode": OCR_RUNTIME.get('fast_mode', True),
        },
    }


if __name__ == "__main__":
    import uvicorn

    # Allow overriding the port via LOCAL_OCR_PORT environment variable.
    port = int(os.environ.get('LOCAL_OCR_PORT', '5000'))
    uvicorn.run(app, host="0.0.0.0", port=port)
