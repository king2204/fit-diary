// Camera barcode scanning. Uses the zxing-wasm decoder, so it works on iPhone too
// (Safari has no built-in BarcodeDetector). The decoder file is served with the app.
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
});

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;

export interface Scan {
  stop(): void;
}

// Shows the back camera in `video` and calls `onCode` once with the first food barcode it sees.
export async function startScan(video: HTMLVideoElement, onCode: (code: string) => void): Promise<Scan> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();
  const detector = new BarcodeDetector({ formats: [...FORMATS] });
  let running = true;
  const stop = () => {
    running = false;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
  const loop = async () => {
    if (!running) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length && running) {
        stop();
        onCode(codes[0].rawValue);
        return;
      }
    } catch (e) {
      console.warn('Barcode detection failed', e);
    }
    setTimeout(loop, 200);
  };
  loop();
  return { stop };
}
