import os
import sys
import logging
import traceback
import time
from typing import Dict, Any
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
            }

        text = clean_ocr_result(result)
        logger.debug('OCR text length=%d', len(text))

        return {
            "success": True,
            "text": text,
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
