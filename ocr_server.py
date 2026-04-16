from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from paddleocr import PaddleOCR
import base64
import cv2
import numpy as np

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ocr = PaddleOCR(use_angle_cls=True, lang="en")


class ImageRequest(BaseModel):
    image: str


def decode_base64_image(base64_str: str):
    if "," in base64_str:
        base64_str = base64_str.split(",", 1)[1]

    img_data = base64.b64decode(base64_str)
    np_arr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    return img


def clean_ocr_result(result):
    lines = []

    if not result:
        return ""

    for line in result[0]:
        text = line[1][0]
        confidence = line[1][1]

        if confidence > 0.5:
            lines.append(text)

    return "\n".join(lines)


@app.post("/ocr")
async def extract_text(request: ImageRequest):
    try:
        img = decode_base64_image(request.image)
        result = ocr.ocr(img, cls=True)

        if not result:
            return {
                "success": False,
                "text": "",
                "error": "NO_TEXT_DETECTED",
            }

        text = clean_ocr_result(result)

        return {
            "success": True,
            "text": text,
        }

    except Exception as e:
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
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5000)
