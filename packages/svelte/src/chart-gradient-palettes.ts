import { drawingGradientStops, type DrawingGradient } from '@tumblerjs/ooxml';
import type { ChartMark } from '@tumblerjs/charts';

/** Many points share one ramp even when their geometry or 3-D face lighting differs. */
export function chartGradientPalettes(marks: readonly ChartMark[], prefix: string) {
  const bindings = new Map<DrawingGradient, string>();
  const palettes = new Map<string, { id: string; stops: DrawingGradient['stops'] }>();
  function bind(gradient: DrawingGradient | undefined) {
    if (!gradient || bindings.has(gradient)) return;
    const key = JSON.stringify(gradient.stops);
    let palette = palettes.get(key);
    if (!palette) { palette = { id: `${prefix}-palette-${palettes.size}`, stops: drawingGradientStops(gradient) }; palettes.set(key, palette); }
    bindings.set(gradient, palette.id);
  }
  function visit(marks: readonly ChartMark[]) {
    for (const mark of marks) {
      bind(mark.fillGradient?.gradient); bind(mark.strokeGradient);
      if (mark.kind === 'group') visit(mark.marks);
    }
  }
  visit(marks); return { bindings, palettes: [...palettes.values()] };
}
