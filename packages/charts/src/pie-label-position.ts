import type { ChartRect } from './layout.ts';
import type { ChartDataLabelOptions } from './data-labels.ts';
import { chartMarksBounds } from './shape-scene.ts';
import { translateChartMark } from './mark-translation.ts';
import { chartStroke } from './scene-style.ts';
import { line, type ChartMark, type SceneContext } from './scene-marks.ts';

export interface PieLabelGeometry {
  readonly cx: number;
  readonly cy: number;
  readonly inner: number;
  readonly outer: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly tilt: number;
}

export interface PieLabelFrame {
  readonly bounds: ChartRect;
  readonly rotation: number;
}

const GAP = 16 / 3; // Office's four-point distance, in CSS pixels.
const TAU = Math.PI * 2;

function fitsSlice(box: ChartRect, pie: PieLabelGeometry): boolean {
  if (pie.tilt < 1e-6) return false;
  return [box.x, box.x + box.width].every(x => [box.y, box.y + box.height].every(y => {
    const dx = x - pie.cx, dy = (y - pie.cy) / pie.tilt;
    const radius = Math.hypot(dx, dy);
    const angle = ((Math.atan2(dy, dx) - pie.startAngle) % TAU + TAU) % TAU;
    return radius >= pie.inner && radius <= pie.outer && angle <= pie.endAngle - pie.startAngle + 1e-9;
  }));
}

/** Position the measured label box relative to its wedge, including exploded and tilted pies. */
export function positionPieLabel(context: Pick<SceneContext, 'measure'>, marks: ChartMark[], pie: PieLabelGeometry, position: string): ChartMark[] {
  const bounds = chartMarksBounds(context, marks);
  if (!bounds) return marks;
  const angle = (pie.startAngle + pie.endAngle) / 2;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const radius = (pie.inner + pie.outer) / 2;
  const center = { x: pie.cx + cos * radius, y: pie.cy + sin * radius * pie.tilt };
  let target = { ...bounds, x: center.x - bounds.width / 2, y: center.y - bounds.height / 2 };
  const resolved = position === 'bestFit' ? fitsSlice(target, pie) ? 'ctr' : 'outEnd' : position;
  if (resolved === 'inEnd' || resolved === 'outEnd') {
    const inside = resolved === 'inEnd';
    const r = pie.outer + (inside ? -GAP : GAP);
    const x = pie.cx + cos * r, y = pie.cy + sin * r * pie.tilt;
    const horizontal = Math.abs(cos) < 1e-6 ? .5 : (cos > 0) === inside ? 1 : 0;
    const vertical = Math.abs(sin) < 1e-6 ? .5 : (sin > 0) === inside ? 1 : 0;
    target = { ...bounds, x: x - bounds.width * horizontal, y: y - bounds.height * vertical };
  }
  return marks.map(mark => translateChartMark(mark, target.x - bounds.x, target.y - bounds.y));
}

/** Office shows leaders for manually displaced labels outside the pie, rather than every outside label. */
export function pieLabelLeader(context: SceneContext, marks: ChartMark[], pie: PieLabelGeometry, settings: ChartDataLabelOptions, frame?: PieLabelFrame): ChartMark[] {
  if (!settings.showLeaderLines || !settings.layout || (settings.layout.x === undefined && settings.layout.y === undefined)) return [];
  const box = chartMarksBounds(context, marks);
  if (!box || pie.tilt < 1e-6) return [];
  const bounds = frame?.bounds ?? box;
  const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
  const rotation = (frame?.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const nearest = (x: number, y: number) => {
    const localX = Math.max(bounds.x, Math.min(cx + (x - cx) * cos + (y - cy) * sin, bounds.x + bounds.width));
    const localY = Math.max(bounds.y, Math.min(cy - (x - cx) * sin + (y - cy) * cos, bounds.y + bounds.height));
    return { x: cx + (localX - cx) * cos - (localY - cy) * sin, y: cy + (localX - cx) * sin + (localY - cy) * cos };
  };
  const close = nearest(pie.cx, pie.cy);
  if (Math.hypot(close.x - pie.cx, (close.y - pie.cy) / pie.tilt) <= pie.outer) return [];
  const angle = (pie.startAngle + pie.endAngle) / 2;
  const x = pie.cx + Math.cos(angle) * pie.outer, y = pie.cy + Math.sin(angle) * pie.outer * pie.tilt;
  const end = nearest(x, y);
  return line(x, y, end.x, end.y, chartStroke('axis', settings.leaderLineStyle, context.model, context.options.resolveColor));
}
