// Notes keep pasted images inline, as base64 text inside the note's JSON, and every store lives in
// localStorage (about 5 MB for the whole site) — so an image has to be small to be affordable. A
// phone photo or full-screen screenshot pasted as-is is 1–8 MB of text; scaled to fit 1600 px and
// re-encoded it is typically a tenth of that and still sharp on screen.

const MAX_DIMENSION = 1600;
const QUALITY = 0.82;
// Below this an image is left alone: recompressing a small one only costs quality.
const SKIP_BELOW_BYTES = 150 * 1024;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

// Returns a data URL for the image — the original if it is small, animated (GIF), can't be decoded,
// or wouldn't get any smaller; otherwise a scaled-down WebP (browsers without WebP encoding fall
// back to PNG, which is then only used if it really is smaller).
export async function compressImageBlob(file: Blob): Promise<string> {
  const original = await readAsDataUrl(file);
  if (file.size <= SKIP_BELOW_BYTES || file.type === 'image/gif' || file.type === 'image/svg+xml') return original;
  return recompressDataUrl(original, file.size);
}

// Same, starting from a data URL already stored in a note. `byteSize` is its current size.
export async function recompressDataUrl(dataUrl: string, byteSize = Math.floor(dataUrl.length * 0.75)): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width  = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', QUALITY));
    if (!blob || blob.size >= byteSize * 0.9) return dataUrl;
    return await readAsDataUrl(blob);
  } catch {
    return dataUrl;
  }
}
