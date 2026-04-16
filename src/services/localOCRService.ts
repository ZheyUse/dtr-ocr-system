const DEFAULT_LOCAL_OCR_ENDPOINT = 'http://localhost:5000/ocr';

export interface LocalOCRLine {
  text: string;
  confidence: number;
  bbox?: Array<[number, number]> | null;
  rect?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface LocalOCRPage {
  pageIndex: number;
  lines: LocalOCRLine[];
}

export interface LocalOCRJsonPayload {
  schemaVersion: string;
  pages: LocalOCRPage[];
  stats?: {
    lineCount?: number;
    avgConfidence?: number;
  };
}

export interface LocalStructuredMeta {
  parser: string;
  entryCount: number;
  avgMatchedLineConfidence: number;
  confidence: number;
  shouldUseLLM: boolean;
}

export interface LocalOCRExtractionPayload {
  text: string;
  ocrJson?: LocalOCRJsonPayload;
  structuredDtr?: Record<string, unknown> | null;
  structuredMeta?: LocalStructuredMeta;
}

const getLocalOCREndpoint = (): string => {
  return (process.env.REACT_APP_LOCAL_OCR_ENDPOINT || DEFAULT_LOCAL_OCR_ENDPOINT).trim();
};

const resolveHealthEndpoint = (): string => {
  const endpoint = getLocalOCREndpoint();
  if (endpoint.endsWith('/ocr')) {
    return `${endpoint.slice(0, -4)}/health`;
  }

  return `${endpoint.replace(/\/$/, '')}/health`;
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to convert file to base64.'));
        return;
      }

      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Base64 payload is empty.'));
        return;
      }

      resolve(base64);
    };

    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
};

export const isLocalOCRServerAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(resolveHealthEndpoint(), {
      method: 'GET',
    });

    return response.ok;
  } catch {
    return false;
  }
};

export const extractLocalOCRPayload = async (file: File): Promise<LocalOCRExtractionPayload> => {
  const base64 = await fileToBase64(file);
  const endpoint = getLocalOCREndpoint();

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: base64 }),
    });
  } catch (error) {
    console.error('[localOCRService] Network failure calling local OCR endpoint', {
      endpoint,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  if (!response.ok) {
    console.error('[localOCRService] Local OCR HTTP failure', {
      endpoint,
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`LOCAL_OCR_HTTP_${response.status}`);
  }

  const payload = (await response.json()) as {
    success?: boolean;
    text?: string;
    error?: string;
    ocr_json?: LocalOCRJsonPayload;
    structured_dtr?: Record<string, unknown> | null;
    structured_meta?: LocalStructuredMeta;
  };

  if (!payload.success) {
    console.error('[localOCRService] Local OCR returned failure payload', {
      endpoint,
      error: payload.error || 'LOCAL_OCR_FAILED',
    });
    throw new Error(payload.error || 'LOCAL_OCR_FAILED');
  }

  return {
    text: (payload.text || '').trim(),
    ocrJson: payload.ocr_json,
    structuredDtr: payload.structured_dtr,
    structuredMeta: payload.structured_meta,
  };
};

export const extractLocalOCRText = async (file: File): Promise<string> => {
  const payload = await extractLocalOCRPayload(file);
  return payload.text;
};

export const getLocalOCRServerHelpText = (): string => {
  const endpoint = getLocalOCREndpoint();
  return `Local OCR server is not detected. Install dependencies with: pip install paddleocr fastapi uvicorn opencv-python numpy. Start server with: python ocr_server.py. Expected endpoint: ${endpoint}`;
};
