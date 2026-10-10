import type { ComputedWordTextFormat } from '@tumblerjs/word';
import type { CanvasTextMetricSource } from './word-font-metrics.ts';

/** Normal line boxes include font leading that Canvas TextMetrics omits. Measure at a large
 * size once per face to avoid CSS-pixel rounding accumulating across a document. */
export function browserWordLineMetrics(context: CanvasTextMetricSource) {
  const cache = new Map<string, { ascent: number; descent: number }>();
  return {
    clear() { cache.clear(); },
    measure(format: Pick<ComputedWordTextFormat, 'fontSizePoints' | 'bold' | 'italic'>, family: string) {
      if (typeof document === 'undefined' || !document.body) return undefined;
      const font = `${format.italic ? 'italic' : 'normal'} ${format.bold ? 700 : 400} 1000px ${family}`;
      let metrics = cache.get(font);
      if (!metrics) {
        const probe = document.createElement('span');
        probe.textContent = 'M';
        probe.style.cssText = 'position:fixed;top:-10000px;left:0;display:inline-block;visibility:hidden;pointer-events:none;white-space:pre;padding:0;border:0;margin:0';
        probe.style.font = font;
        probe.style.lineHeight = 'normal';
        document.body.append(probe);
        const height = probe.getBoundingClientRect().height;
        probe.remove();
        const previous = context.font;
        context.font = font;
        const measured = context.measureText('M');
        context.font = previous;
        const ascent = measured.fontBoundingBoxAscent || measured.emHeightAscent || 800;
        const descent = measured.fontBoundingBoxDescent || measured.emHeightDescent || 200;
        const leading = Math.max(0, height - ascent - descent);
        // Word puts the font's external leading above its baseline. Paragraph line
        // spacing is separate and belongs below the line in the layout engine.
        metrics = { ascent: (ascent + leading) / 1000, descent: descent / 1000 };
        cache.set(font, metrics);
      }
      return {
        ascent: Math.round(metrics.ascent * format.fontSizePoints * 20) / 20,
        descent: Math.round(metrics.descent * format.fontSizePoints * 20) / 20,
      };
    },
  };
}
