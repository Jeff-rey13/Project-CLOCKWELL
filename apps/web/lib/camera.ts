export const SELFIE_MAX_SIDE = 640;
export const SELFIE_QUALITY = 0.7;

export async function openCamera(facingMode: 'user' | 'environment'): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Resolves once the camera has produced a frame, or rejects after `ms`. */
export function waitForFrame(video: HTMLVideoElement, ms = 4000): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', done);
      if (video.videoWidth > 0) resolve();
      else reject(new Error('camera not ready'));
    };
    const timer = setTimeout(done, ms);
    video.addEventListener('loadeddata', done);
  });
}

/** Grabs a frame and compresses it to WebP, longest side 640 px, quality 0.7. */
export async function captureSelfie(video: HTMLVideoElement): Promise<Blob> {
  await waitForFrame(video);
  const w = video.videoWidth;
  const h = video.videoHeight;
  const scale = Math.min(1, SELFIE_MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('compression failed'))),
      'image/webp',
      SELFIE_QUALITY,
    );
  });
}
