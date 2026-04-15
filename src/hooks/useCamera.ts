import { useCallback, useEffect, useState } from 'react';

const stopTracks = (mediaStream: MediaStream | null): void => {
  if (!mediaStream) {
    return;
  }

  mediaStream.getTracks().forEach((track) => track.stop());
};

export const useCamera = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openCamera = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      setStream(mediaStream);
      setIsOpen(true);
    } catch {
      setError('Unable to access camera. Please check browser permissions.');
    }
  }, []);

  const closeCamera = useCallback((): void => {
    stopTracks(stream);
    setStream(null);
    setIsOpen(false);
  }, [stream]);

  const captureFrame = useCallback(async (videoElement: HTMLVideoElement): Promise<File> => {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 1280;
    canvas.height = videoElement.videoHeight || 720;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to capture frame.');
    }

    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (!value) {
          reject(new Error('Failed to capture image from camera.'));
          return;
        }

        resolve(value);
      }, 'image/jpeg', 0.95);
    });

    return new File([blob], `dtr-capture-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  }, []);

  useEffect(() => {
    return () => {
      stopTracks(stream);
    };
  }, [stream]);

  return {
    isOpen,
    stream,
    error,
    openCamera,
    closeCamera,
    captureFrame,
  };
};
