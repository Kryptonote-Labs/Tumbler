import { wordPointsToCssPixels, type ComputedWordTextFormat } from '@tumblerjs/word';

const documents = new WeakMap<Document, Map<string, number>>();

/** CSS centres leading and rounds font metrics at the rendered size. Measure its
 * baseline so a positioned text span can honour the document engine's baseline. */
export function browserWordBaselineOffset(
  format: Pick<ComputedWordTextFormat, 'fontSizePoints' | 'bold' | 'italic'>,
  family: string,
  heightPoints: number,
): number | undefined {
  if (typeof document === 'undefined' || !document.body) return undefined;
  let cache = documents.get(document);
  if (!cache) {
    cache = new Map();
    documents.set(document, cache);
    const fontCache = cache;
    document.fonts.addEventListener('loadingdone', () => fontCache.clear());
  }
  const font = `${format.italic ? 'italic' : 'normal'} ${format.bold ? 700 : 400} ${wordPointsToCssPixels(format.fontSizePoints)}px ${family}`;
  const key = `${font}/${heightPoints}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;top:-10000px;left:0;display:inline-block;visibility:hidden;pointer-events:none;white-space:pre;padding:0;border:0;margin:0';
  probe.style.font = font;
  probe.style.lineHeight = `${wordPointsToCssPixels(heightPoints)}px`;
  probe.textContent = 'M';
  const marker = document.createElement('span');
  marker.style.cssText = 'display:inline-block;vertical-align:baseline;width:0;height:0;padding:0;border:0;margin:0';
  probe.append(marker);
  document.body.append(probe);
  const offset = (marker.getBoundingClientRect().top - probe.getBoundingClientRect().top) / wordPointsToCssPixels(1);
  probe.remove();
  cache.set(key, offset);
  return offset;
}
