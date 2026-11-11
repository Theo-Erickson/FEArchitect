// Browser side of map sprites: loads data/mapsprites.json and the sheets it names, then
// slices frames on demand through the pure pipeline and caches each as a data URL.
// Every failure returns null so the viewer can fall back to the class token.
import { cropFrame, keyOut, remapPalette, greyscale, frameRect, validateMapping, type MapSpriteData, type PixelBuf } from "../grid/mapsprite.ts";

let data: MapSpriteData | null = null;
const sheets = new Map<string, PixelBuf | null>(); // file name -> pixels, null if it failed
const cache = new Map<string, string | null>();     // classId:side:acted:frame -> data URL

function loadSheet(file: string): Promise<PixelBuf | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, c.width, c.height);
        resolve({ width: id.width, height: id.height, data: id.data });
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = `/assets/mapsprites/${encodeURIComponent(file)}`;
  });
}

function toDataUrl(b: PixelBuf): string {
  const c = document.createElement("canvas");
  c.width = b.width; c.height = b.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.width, b.height), 0, 0);
  return c.toDataURL();
}

// Look up a class's entry, ignoring inherited keys like "constructor".
function entry(classId: string) {
  return data && Object.hasOwn(data.classes, classId) ? data.classes[classId] : undefined;
}

let loading: Promise<void> | null = null;

async function doLoad(): Promise<void> {
  let loaded: MapSpriteData;
  try {
    const r = await fetch("/data/mapsprites.json");
    const json = r.ok ? await r.json() : null;
    const problems = validateMapping(json);
    if (problems.length) { console.warn("mapsprites.json:", problems); loading = null; return; }
    loaded = json as MapSpriteData;
  } catch { loading = null; return; }
  const files = [...new Set(Object.values(loaded.classes).map((e) => e.sheet))];
  await Promise.all(files.map(async (f) => { if (!sheets.has(f)) sheets.set(f, await loadSheet(f)); }));
  data = loaded; // published only once every sheet has settled
}

// Load the mapping and every sheet it references. Safe to call more than once or concurrently.
export function loadMapSprites(): Promise<void> {
  return loading ??= doLoad();
}

// Idle frame count for a class, or 0 when it has no usable sprite.
export function frameCount(classId: string): number {
  const e = entry(classId);
  return e && sheets.get(e.sheet) ? e.frames : 0;
}

// Native pixel size of a class's frame, or null.
export function frameSize(classId: string): { w: number; h: number } | null {
  const e = entry(classId);
  return e && sheets.get(e.sheet) ? { w: e.w, h: e.h } : null;
}

export function spriteUrl(classId: string, side: "player" | "enemy", acted: boolean, frame: number): string | null {
  if (!Number.isInteger(frame)) return null;
  const key = `${classId}:${side}:${acted ? 1 : 0}:${frame}`;
  if (cache.has(key)) return cache.get(key)!;
  let url: string | null = null;
  try {
    const e = entry(classId);
    const sheet = e ? sheets.get(e.sheet) : null;
    if (e && sheet) {
      const r = frameRect(e, frame);
      let b = keyOut(cropFrame(sheet, r.x, r.y, r.w, r.h), e.bg);
      if (side === "enemy") b = remapPalette(b, data!.palettes.player, data!.palettes.enemy);
      if (acted) b = greyscale(b);
      url = toDataUrl(b);
    }
  } catch (err) { console.warn(`map sprite ${key}:`, err); }
  cache.set(key, url);
  return url;
}
