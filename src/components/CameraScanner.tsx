import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  onCode: (code: string) => void;
  onClose: () => void;
}

type Detect = (frame: HTMLVideoElement) => Promise<string | undefined>;

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** Camera scanning works only on https (or this computer), and needs getUserMedia. */
export const cameraSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
export const cameraNeedsHttps = () => typeof window !== 'undefined' && !window.isSecureContext;

/** The phone's own detector (Chrome on Android) when it reads book barcodes, else ZXing (iPhone, Firefox). */
async function makeDetector(): Promise<Detect> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> }; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (BD) {
    try {
      const have = (await BD.getSupportedFormats?.()) ?? FORMATS;
      if (have.includes('ean_13')) {
        const d = new BD({ formats: FORMATS.filter((f) => have.includes(f)) });
        return async (v) => (await d.detect(v))[0]?.rawValue;
      }
    } catch {
      /* fall through to ZXing */
    }
  }
  const Z = await import('@zxing/library');
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return (v) => Promise.resolve(readBand(v));
  function readBand(v: HTMLVideoElement): string | undefined {
    // Read a band across the middle of the picture, where the guide box is. Smaller is faster.
    const w = Math.min(v.videoWidth, 960);
    const scale = w / v.videoWidth;
    const h = Math.round(v.videoHeight * scale * 0.5);
    if (!w || !h) return undefined;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(v, 0, v.videoHeight * 0.25, v.videoWidth, v.videoHeight * 0.5, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const lum = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) lum[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    try {
      const src = new Z.RGBLuminanceSource(lum, w, h);
      return reader.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(src))).getText();
    } catch {
      return undefined;
    } finally {
      reader.reset();
    }
  }
}

function cameraError(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Stacks isn’t allowed to use the camera. Tap the lock or “aA” next to the web address, allow the camera, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'Another app is using the camera. Close it and try again.';
  return 'The camera didn’t start. Try again, or type the ISBN instead.';
}

/** Full-screen camera view. Keeps scanning until you close it, so you can do a whole stack in a row. */
export function CameraScanner({ onCode, onClose }: Readonly<Props>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>();
  const [starting, setStarting] = useState(true);
  const [last, setLast] = useState<{ code: string; n: number }>();
  const [torch, setTorch] = useState<boolean>();
  const trackRef = useRef<MediaStreamTrack>();
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    // A code must be read twice in a row before it counts, and the same code is ignored for a few seconds.
    let candidate = '';
    let lastCode = '';
    let lastAt = 0;
    let n = 0;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (stopped) return;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => undefined);
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean; focusMode?: string[] };
        if (caps.torch) setTorch(false);
        if (caps.focusMode?.includes('continuous'))
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
        const detect = await makeDetector();
        if (stopped) return;
        setStarting(false);
        const tick = async () => {
          if (stopped) return;
          if (v.readyState >= 2) {
            const code = (await detect(v).catch(() => undefined))?.replace(/\D/g, '');
            if (code && code.length >= 8) {
              if (code === candidate && (code !== lastCode || Date.now() - lastAt > 4000)) {
                lastCode = code;
                lastAt = Date.now();
                candidate = '';
                n++;
                setLast({ code, n });
                navigator.vibrate?.(60);
                onCodeRef.current(code);
              } else candidate = code;
            }
          }
          timer = window.setTimeout(tick, 120);
        };
        void tick();
      } catch (e) {
        if (!stopped) {
          setError(cameraError(e));
          setStarting(false);
        }
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Escape, and the phone's back button or swipe, close the camera too.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    const onPop = () => onCloseRef.current();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    history.pushState({ stacksCamera: true }, '');
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      document.body.style.overflow = overflow;
      if (history.state?.stacksCamera) history.back();
    };
  }, []);

  const toggleTorch = () => {
    const on = !torch;
    trackRef.current?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).then(() => setTorch(on), () => setTorch(undefined));
  };

  // Straight under <body>, so nothing on the page can sit on top of the camera.
  return createPortal(
    <div className="camera-scan" role="dialog" aria-modal="true" aria-label="Scan with camera">
      <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
      <div className="camera-guide" aria-hidden="true">
        <span className={last ? 'hit' : ''} key={last?.n} />
      </div>
      <div className="camera-top">
        <button className="camera-x" onClick={onClose} aria-label="Close the camera">✕</button>
        {torch !== undefined && (
          <button className="btn camera-torch" aria-pressed={torch} onClick={toggleTorch}>{torch ? 'Light off' : 'Light on'}</button>
        )}
      </div>
      <div className="camera-bottom">
        <div aria-live="polite">
        {error ? (
          <p className="camera-error">{error}</p>
        ) : starting ? (
          <p>Starting the camera…</p>
        ) : last ? (
          <p>
            <strong>Got {last.code}</strong> · {last.n} scanned. Point at the next one, or press Done scanning.
          </p>
        ) : (
          <p>Hold the barcode inside the box, about a hand’s width away.</p>
        )}
        </div>
        <button className="camera-done" onClick={onClose}>{last ? 'Done scanning' : 'Close camera'}</button>
      </div>
    </div>,
    document.body,
  );
}
