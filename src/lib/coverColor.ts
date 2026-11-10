import { useEffect, useState } from 'react';

export interface SpineColors {
  bg: string;
  fg: string;
}

const cache = new Map<string, SpineColors | null>();
const pending = new Map<string, Promise<SpineColors | null>>();

/**
 * The colour along the left edge of a front cover, which on most books runs
 * on round the spine. Needs the image host to allow reading pixels (Open
 * Library does); returns null when it doesn't.
 */
function extract(url: string): Promise<SpineColors | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        if (img.naturalWidth < 5) return resolve(null);
        const w = 12;
        const h = 48;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        // Left 6% of the cover, squashed into a small grid.
        ctx.drawImage(img, 0, 0, Math.max(1, img.naturalWidth * 0.06), img.naturalHeight, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        // Most common colour bucket, so a stripe of text doesn't muddy it.
        const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
        for (let i = 0; i < d.length; i += 4) {
          const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
          const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
          bk.n++;
          bk.r += d[i];
          bk.g += d[i + 1];
          bk.b += d[i + 2];
          buckets.set(key, bk);
        }
        const top = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
        const [r, g, b] = [top.r / top.n, top.g / top.n, top.b / top.n].map(Math.round);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        resolve({ bg: `rgb(${r} ${g} ${b})`, fg: lum > 0.6 ? 'rgb(28 24 20)' : 'rgb(250 247 242)' });
      } catch {
        resolve(null); // the host doesn't allow reading the pixels
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function useCoverColor(url?: string): SpineColors | null | undefined {
  const [colors, setColors] = useState<SpineColors | null | undefined>(() => (url ? cache.get(url) : null));
  useEffect(() => {
    if (!url) return setColors(null);
    if (cache.has(url)) return setColors(cache.get(url));
    let live = true;
    let p = pending.get(url);
    if (!p) {
      p = extract(url).then((c) => {
        cache.set(url, c);
        pending.delete(url);
        return c;
      });
      pending.set(url, p);
    }
    p.then((c) => live && setColors(c)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [url]);
  return colors;
}

/** Turn a photo of a spine into a small upright JPEG for storage. */
export function spinePhotoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Spines are tall and thin; a wide photo was taken sideways, so stand it up.
      const sideways = img.naturalWidth > img.naturalHeight;
      const srcW = sideways ? img.naturalHeight : img.naturalWidth;
      const srcH = sideways ? img.naturalWidth : img.naturalHeight;
      const scale = Math.min(1, 600 / srcH);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(srcW * scale));
      c.height = Math.max(1, Math.round(srcH * scale));
      const ctx = c.getContext('2d')!;
      if (sideways) {
        ctx.translate(c.width, 0);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, 0, 0, c.height, c.width);
      } else {
        ctx.drawImage(img, 0, 0, c.width, c.height);
      }
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image Stacks can read."));
    };
    img.src = url;
  });
}
