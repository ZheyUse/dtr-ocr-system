const DEFAULT_LOCAL_OCR_ENDPOINT = 'http://localhost:5000/ocr';

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

export const extractLocalOCRText = async (file: File): Promise<string> => {
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
  };

  if (!payload.success) {
    console.error('[localOCRService] Local OCR returned failure payload', {
      endpoint,
      error: payload.error || 'LOCAL_OCR_FAILED',
    });
    throw new Error(payload.error || 'LOCAL_OCR_FAILED');
  }

  return (payload.text || '').trim();
};

export const getLocalOCRServerHelpText = (): string => {
  const endpoint = getLocalOCREndpoint();
  return `Local OCR server is not detected. Install dependencies with: pip install paddleocr fastapi uvicorn opencv-python numpy. Start server with: python ocr_server.py. Expected endpoint: ${endpoint}`;
};
