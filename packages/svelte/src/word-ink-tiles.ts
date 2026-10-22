import { wordPageInkBounds, type WordLayoutPage } from '@tumblerjs/word';

type Box = { x: number; y: number; width: number; height: number };
export const WORD_INK_TILE_PIXELS = 256 * 256;
export const WORD_INK_PAGE_PIXELS = 1_048_576;
export const WORD_INK_TOTAL_PIXELS = 4_194_304;
let reservedPixels = 0;

/** Reserve retained overlay pixels across mounted pages, including in-flight renders. */
export function reserveWordInkPixels(pixels: number) {
  if (!Number.isSafeInteger(pixels) || pixels < 0) throw new RangeError('Invalid ink pixel reservation.');
  if (pixels > WORD_INK_TOTAL_PIXELS - reservedPixels) return undefined;
  reservedPixels += pixels;
  let released = false;
  return () => { if (!released) { released = true; reservedPixels -= pixels; } };
}

/** Pixel-aligned, disjoint crops; reduce resolution until the entire overlay fits. */
export function wordInkTiles(page: WordLayoutPage, requestedScale: number, maxPixels = WORD_INK_PAGE_PIXELS) {
  if (!Number.isSafeInteger(maxPixels) || maxPixels < 1 || maxPixels > WORD_INK_PAGE_PIXELS) throw new RangeError('Invalid ink overlay pixel budget.');
  if (!(requestedScale > 0) || !Number.isFinite(requestedScale) || !(page.width > 0) || !(page.height > 0) || !Number.isFinite(page.width) || !Number.isFinite(page.height)) throw new RangeError('Invalid ink overlay dimensions.');
  const bounds = wordPageInkBounds(page);
  if (bounds.some(box => !Object.values(box).every(Number.isFinite))) throw new RangeError('Invalid ink overlay bounds.');
  const boxes = bounds.map(box => {
    const x = Math.max(0, box.x), y = Math.max(0, box.y);
    return { x, y, width: Math.min(page.width, box.x + box.width) - x, height: Math.min(page.height, box.y + box.height) - y };
  }).filter(box => box.width > 0 && box.height > 0);
  for (let scale = Math.min(4, requestedScale), attempt = 0; attempt < 1024; attempt++, scale /= 2) {
    const tiles = new Map<string, Box>();
    let oversized = false;
    for (const box of boxes) {
      const left = Math.floor(box.x * scale), top = Math.floor(box.y * scale);
      const right = Math.ceil((box.x + box.width) * scale), bottom = Math.ceil((box.y + box.height) * scale);
      const columns = Math.ceil(right / 256) - Math.floor(left / 256), rows = Math.ceil(bottom / 256) - Math.floor(top / 256);
      if (![left, top, right, bottom].every(Number.isSafeInteger) || !Number.isSafeInteger(columns * rows) || columns * rows > 256) { oversized = true; break; }
      for (let y = Math.floor(top / 256) * 256; y < bottom; y += 256) for (let x = Math.floor(left / 256) * 256; x < right; x += 256) {
        const key = `${x}:${y}`, previous = tiles.get(key);
        const x1 = Math.min(previous?.x ?? Infinity, Math.max(x, left)), y1 = Math.min(previous?.y ?? Infinity, Math.max(y, top));
        const x2 = Math.max(previous ? previous.x + previous.width : -Infinity, Math.min(x + 256, right));
        const y2 = Math.max(previous ? previous.y + previous.height : -Infinity, Math.min(y + 256, bottom));
        tiles.set(key, { x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
      }
      if (tiles.size > 256) { oversized = true; break; }
    }
    const pixels = [...tiles.values()].reduce((sum, tile) => sum + tile.width * tile.height, 0);
    if (!oversized && pixels <= maxPixels) return { scale, tiles: [...tiles.values()], pixels };
  }
  throw new RangeError('Ink overlay cannot fit its pixel budget.');
}
