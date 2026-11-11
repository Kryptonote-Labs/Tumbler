import { chartPointFill } from './fill-scene.ts';
import { chartPointStroke } from './stroke-scene.ts';
import { chartDataLabelMarks } from './label-scene.ts';
import { indexChartSequence } from './indexed-data.ts';
import { chartPointColor } from './point-style.ts';
import { pieScene } from './scene-pie.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

/** Translate generated subchart marks without changing their authored text or colours. */
function move(mark: ChartMark, x: number, y: number): ChartMark {
  if (mark.fillGradient) mark = { ...mark, fillGradient: { ...mark.fillGradient, bounds: { ...mark.fillGradient.bounds, x: mark.fillGradient.bounds.x + x, y: mark.fillGradient.bounds.y + y } } };
  if (mark.fillPattern) mark = { ...mark, fillPattern: { ...mark.fillPattern, bounds: { ...mark.fillPattern.bounds, x: mark.fillPattern.bounds.x + x, y: mark.fillPattern.bounds.y + y } } };
  if (mark.fillPicture) mark = { ...mark, fillPicture: { ...mark.fillPicture, bounds: { ...mark.fillPicture.bounds, x: mark.fillPicture.bounds.x + x, y: mark.fillPicture.bounds.y + y } } };
  switch (mark.kind) {
    case 'group': return { ...mark, ...(mark.clip ? { clip: { ...mark.clip, x: mark.clip.x + x, y: mark.clip.y + y } } : {}), marks: mark.marks.map(mark => move(mark, x, y)) };
    case 'text': case 'rect': return { ...mark, x: mark.x + x, y: mark.y + y };
    case 'circle': return { ...mark, cx: mark.cx + x, cy: mark.cy + y };
    case 'line': return { ...mark, x1: mark.x1 + x, x2: mark.x2 + x, y1: mark.y1 + y, y2: mark.y2 + y };
    case 'path': {
      // Pie paths contain only absolute M/L/A/Z commands. Elliptical arc arguments
      // include radii and flags, so only their endpoint pairs are translated.
      const d = mark.d.replace(/([MLA])\s*([^MLAZ]+)/g, (_, command: string, values: string) => {
        const numbers = values.trim().split(/[\s,]+/).map(Number);
        const start = command === 'A' ? 5 : 0;
        for (let i = start; i < numbers.length; i += 2) { numbers[i] = numbers[i]! + x; numbers[i + 1] = numbers[i + 1]! + y; }
        return command + ' ' + numbers.join(' ') + ' ';
      });
      return { ...mark, d };
    }
  }
}

export function ofPieScene(context: SceneContext): ChartMark[] {
  const { model, width, height } = context;
  const first = model.series[0];
  if (!first) return [];
  const values = first.values?.points.filter(point => typeof point.value === 'number' && point.value > 0) ?? [];
  const total = values.reduce((sum, point) => sum + Number(point.value), 0);
  const position = model.splitPosition ?? 2;
  const secondary = values.filter((point, index) => model.splitBy === 'cust' ? model.customSplit?.includes(point.index) === true : model.splitBy === 'val' ? Number(point.value) < position
    : model.splitBy === 'percent' ? Number(point.value) / total * 100 < position
    : index >= Math.max(0, values.length - Math.max(0, Math.floor(position))));
  const selected = new Set(secondary.map(point => point.index));
  const primary = values.filter(point => !selected.has(point.index));
  if (!secondary.length) return pieScene({ ...context, model: { ...model, kind: 'pie' } });
  const other = secondary.reduce((sum, point) => sum + Number(point.value), 0);
  const mainWidth = width * 0.63;
  const minorWidth = width - mainWidth;
  const minorHeight = height * Math.max(0.1, Math.min(2, (model.secondPieSize ?? 75) / 100));
  const secondarySeries = { ...first, values: { kind: 'number' as const, formula: undefined, formatCode: first.values?.formatCode, points: secondary } };
  const main = pieScene({ ...context, width: mainWidth, model: { ...model, kind: 'pie', legend: undefined, series: [{ ...first, values: { ...secondarySeries.values, points: [...primary, { index: Math.max(-1, ...values.map(point => point.index)) + 1, value: other }] } }] } });
  const marks: ChartMark[] = [...main];
  if (model.splitType === 'bar') {
    const barWidth = minorWidth * 0.3, barHeight = height * 0.55;
    let top = (height - barHeight) / 2;
    for (const point of secondary) {
      const h = Number(point.value) / other * barHeight;
      marks.push({ kind: 'rect', x: mainWidth + (minorWidth - barWidth) / 2, y: top, width: barWidth, height: h, fill: chartPointColor(context, first, 0, point.index), ...chartPointFill(context, first, point.index, { x: mainWidth + (minorWidth - barWidth) / 2, y: top, width: barWidth, height: h }), ...chartPointStroke(context, first, 0, point.index, '#ffffff') });
      marks.push(...chartDataLabelMarks(context, first, 0, { index: point.index, x: mainWidth + minorWidth / 2, y: top + h / 2, category: String(indexChartSequence(first.categories).get(point.index) ?? point.index + 1), value: Number(point.value), percent: Number(point.value) / total }));
      top += h;
    }
  } else {
    const minor = pieScene({ ...context, width: minorWidth, height: minorHeight, model: { ...model, kind: 'pie', title: undefined, legend: undefined, series: [secondarySeries] } }, total);
    marks.push(...minor.map(mark => move(mark, mainWidth, (height - minorHeight) / 2)));
  }
  if (model.legend) marks.push(...pieScene({ ...context, model: { ...model, kind: 'pie' } }).filter(mark => mark.kind === 'group' && mark.role === 'legend'));
  return marks;
}
