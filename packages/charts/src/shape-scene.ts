import { chartFillPaint } from './fill-scene.ts';
import type { ChartRect } from './layout.ts';
import type { ChartShapeStyle } from './model.ts';
import { resolveChartColor } from './colors.ts';
import { chartStroke } from './scene-style.ts';
import { chartStrokeMark } from './stroke-scene.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

export function chartShapeMarks(context: SceneContext, rect: ChartRect, style: ChartShapeStyle | undefined, defaults?: { readonly fill: string; readonly stroke?: string }) : ChartMark[] {
  if (!style && !defaults) return [];
  const color = style?.fill && (context.options.resolveColor?.(style.fill) ?? resolveChartColor(style.fill, context.model));
  const fill = style?.noFill ? 'none' : color ?? defaults?.fill ?? 'none';
  const stroke = style?.lineStyle ? chartStrokeMark(chartStroke('axis', style.lineStyle, context.model, context.options.resolveColor)) : defaults?.stroke ? { stroke: defaults.stroke, strokeWidth: 1 } : {};
  if (!style?.gradient && !style?.picture && fill === 'none' && !('stroke' in stroke && stroke.stroke)) return [];
  return [{ kind: 'rect', ...rect, fill, ...chartFillPaint(context, style, rect), ...stroke }];
}

/** Text, swatches and simple shapes define the automatic title/legend box. */
export function chartMarksBounds(context: SceneContext, marks: readonly ChartMark[]): ChartRect | undefined {
  const boxes = marks.flatMap((mark): ChartRect[] => {
    if (mark.kind === 'group') { const bounds = chartMarksBounds(context, mark.marks); return bounds ? [bounds] : []; }
    if (mark.kind === 'rect') return [mark];
    if (mark.kind === 'circle') return [{ x: mark.cx - mark.r, y: mark.cy - mark.r, width: mark.r * 2, height: mark.r * 2 }];
    if (mark.kind === 'text') {
      const width = context.measure(mark.text, mark.font);
      return [{ x: mark.x - (mark.anchor === 'middle' ? width / 2 : mark.anchor === 'end' ? width : 0), y: mark.y - mark.font.size, width, height: mark.font.size * 1.2 }];
    }
    return [];
  });
  if (!boxes.length) return undefined;
  const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
  return { x, y, width: Math.max(...boxes.map(box => box.x + box.width)) - x, height: Math.max(...boxes.map(box => box.y + box.height)) - y };
}

export function chartLegendShape(context: SceneContext, marks: readonly ChartMark[]): readonly ChartMark[] {
  const style = context.model.legend?.shapeStyle;
  if (!style) return marks;
  return marks.map(mark => {
    if (mark.kind !== 'group') return mark;
    if (mark.role !== 'legend') return { ...mark, marks: chartLegendShape(context, mark.marks) };
    const bounds = chartMarksBounds(context, mark.marks);
    const shape = bounds ? chartShapeMarks(context, { x: bounds.x - 5, y: bounds.y - 4, width: bounds.width + 10, height: bounds.height + 8 }, style) : [];
    return { ...mark, marks: [...shape, ...mark.marks] };
  });
}
