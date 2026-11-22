import { measureLatexRoman } from './latex-font-metrics';
import { texPoint } from './latex-typography';
import { latexLength } from './latex-lengths';
import { argumentAt, commandEnd, environmentAt, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

type Point = { x: number; y: number };
const legendPositions = new Map([
  ['south west', { x: 0.03, y: 0.97, west: true, north: false }],
  ['south east', { x: 0.97, y: 0.97, west: false, north: false }],
  ['north west', { x: 0.03, y: 0.03, west: true, north: true }],
  ['north east', { x: 0.97, y: 0.03, west: false, north: true }],
]);
type PictureObject = Point & (
  | { kind: 'label'; text: string; height: number }
  | { kind: 'rectangle'; width: number; height: number }
);
type Drawing =
  | { kind: 'picture'; width: number; height: number; objects: PictureObject[]; end: number }
  | { kind: 'axis'; width: string; height: number; xLabel: string; yLabel: string; scaleOnlyAxis: boolean; padding: Point; legendPosition?: string; xTicks: number[]; yTicks: number[]; plots: { points: Point[]; marker: 'circle' | 'triangle' | 'none'; legend?: string }[]; end: number };

const pair = /\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\)/g;
const text = (source: string) => source.replace(/\\([%&#_$])/g, '$1');

function tuple(source: string, from: number) {
  const matcher = new RegExp(pair, 'y');
  matcher.lastIndex = from;
  const match = matcher.exec(source);
  if (match) return { x: +match[1]!, y: +match[2]!, end: matcher.lastIndex };
}

function picture(source: string, environment: NonNullable<ReturnType<typeof environmentAt>>): Drawing | undefined {
  const unit = /\\setlength\s*\{\\unitlength\}\s*\{([^{}]*)\}/.exec(source.slice(0, environment.from));
  const scale = latexLength(unit?.[1] ?? '1pt');
  const size = tuple(source, whitespaceEnd(source, environment.from));
  if (!size || !scale || size.x < 0 || size.y < 0) return;
  const objects: PictureObject[] = [];
  let position = whitespaceEnd(source, size.end);
  while (position < environment.to) {
    const end = commandEnd(source, position);
    if (source.slice(position, end) !== '\\put') return;
    const at = tuple(source, whitespaceEnd(source, end));
    const group = at && groupAt(source, whitespaceEnd(source, at.end));
    if (!at || !group) return;
    const body = source.slice(group.from, group.to).trim();
    const place = { x: at.x * scale, y: (size.y - at.y) * scale };
    const rule = /^\\rule\s*\{([^{}]*)\}\s*\{([^{}]*)\}$/.exec(body);
    const label = /^\\makebox\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)\s*\[l\]\s*\{([^{}]*)\}$/.exec(body);
    if (rule) {
      const width = latexLength(rule[1]);
      const height = latexLength(rule[2]);
      if (width === undefined || height === undefined) return;
      objects.push({ kind: 'rectangle', ...place, width, height });
    } else if (label) objects.push({ kind: 'label', ...place, text: text(label[3]!), height: Number(label[2]) * scale });
    else return;
    position = whitespaceEnd(source, group.end);
  }
  return { kind: 'picture', width: size.x * scale, height: size.y * scale, objects, end: environment.end };
}

function axis(source: string, environment: NonNullable<ReturnType<typeof environmentAt>>): Drawing | undefined {
  const option = groupAt(source, whitespaceEnd(source, environment.from), '[', ']');
  const settings = option ? source.slice(option.from, option.to) : '';
  const values = new Map<string, string>();
  for (const part of settings.matchAll(/(?:^|,)\s*([A-Za-z ]+?)\s*=\s*(?:\{([^{}]*)\}|([^,]+))/g))
    values.set(part[1]!.trim(), (part[2] ?? part[3] ?? '').trim());
  const height = latexLength(values.get('height') ?? '6cm');
  if (height === undefined || height <= 0) return;
  const ticks = (key: string) =>
    (values.get(key) ?? '').split(',').filter(v => v.trim()).map(Number);
  const xTicks = ticks('xtick');
  const yTicks = ticks('ytick');
  if ([...xTicks, ...yTicks].some(value => !Number.isFinite(value))) return;
  const scaleOnlyAxis = values.get('scale only axis') === 'true' ||
    /(?:^|,)\s*scale only axis\s*(?:,|$)/.test(settings);
  const padding = (name: string) => {
    const value = values.get(name) ?? values.get('enlargelimits') ?? 'auto';
    if (value === 'false') return 0;
    return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ? Number(value) : 0.1;
  };
  const plots: Extract<Drawing, { kind: 'axis' }>['plots'] = [];
  const body = source.slice(option?.end ?? environment.from, environment.to);
  for (const command of latexCommands(body)) {
    if (command.name === 'addlegendentry') {
      const label = argumentAt(body, command.end);
      const latest = plots.at(-1);
      if (label && latest) latest.legend = text(body.slice(label.from, label.to));
    }
    if (command.name !== 'addplot') continue;
    const at = whitespaceEnd(body, command.end + Number(body[command.end] === '+'));
    const style = groupAt(body, at, '[', ']');
    const start = whitespaceEnd(body, style?.end ?? at);
    if (!body.startsWith('coordinates', start)) return;
    const data = groupAt(body, whitespaceEnd(body, start + 'coordinates'.length));
    if (!data) return;
    const coordinates = body.slice(data.from, data.to);
    const points = [...coordinates.matchAll(pair)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
    if (!points.length || coordinates.replace(pair, '').trim()) return;
    const marker = style && /(?:^|,)\s*mark\s*=\s*([^,\]]+?)(?:,|$)/.exec(body.slice(style.from, style.to))?.[1];
    plots.push({ points, marker: marker === '*' ? 'circle' : marker === 'triangle*' ? 'triangle' : 'none' });
  }
  if (plots.length) return {
    kind: 'axis', width: values.get('width') ?? '8cm', height, xTicks, yTicks, scaleOnlyAxis, plots,
    padding: { x: padding('enlarge x limits'), y: padding('enlarge y limits') },
    legendPosition: values.get('legend pos'),
    xLabel: text(values.get('xlabel') ?? ''), yLabel: text(values.get('ylabel') ?? ''),
    end: environment.end,
  };
}

/** Ordinary LaTeX pictures and coordinate plots keep their authored figure source. */
export function readLatexDrawing(source: string) {
  if (!/\\begin\s*\{(?:picture|axis)\}/.test(source)) return;
  for (const { name, start } of latexCommands(source)) {
    if (name !== 'begin') continue;
    const tag = /^\\begin\s*\{(picture|axis)\}/.exec(source.slice(start));
    if (!tag) continue;
    const environment = environmentAt(source, start);
    if (!environment) return;
    return environment.name === 'picture' ? picture(source, environment) : axis(source, environment);
  }
}

type Polyline = { kind: 'path'; points: Point[]; stroke: string; width?: number };
type Rectangle = Point & { kind: 'rect'; width: number; height: number; fill?: string; stroke?: string };
type Label = Point & { kind: 'text'; text: string; align?: 'center' | 'right'; rotate?: boolean };
type Dot = Point & { kind: 'dot'; marker: 'circle' | 'triangle'; colour: string };
export type LatexDrawingPrimitive = Polyline | Rectangle | Label | Dot;

export function layoutLatexDrawing(drawing: Drawing, bodyWidth: number, em: number) {
  const primitives: LatexDrawingPrimitive[] = [];
  if (drawing.kind === 'picture') {
    for (const item of drawing.objects) {
      if (item.kind === 'rectangle')
        primitives.push({ ...item, kind: 'rect', y: item.y - item.height, fill: '#000' });
      else primitives.push({ ...item, kind: 'text', y: item.y - item.height / 2 });
    }
    return { width: drawing.width, height: drawing.height, primitives };
  }
  const linewidth = /^([\d.]+)?\\(?:line|text)width$/.exec(drawing.width);
  const requestedWidth = linewidth ? Number(linewidth[1] ?? 1) * bodyWidth : latexLength(drawing.width, em);
  if (!requestedWidth || !Number.isFinite(requestedWidth)) return;
  // PGFPlots subtracts an estimated 45pt from either dimension before drawing the axes.
  // The final picture box depends on the labels that were actually drawn.
  const allowance = drawing.scaleOnlyAxis ? 0 : 45 * texPoint;
  const axisWidth = requestedWidth - allowance;
  const axisHeight = drawing.height - allowance;
  if (axisWidth <= 0 || axisHeight <= 0) return;
  const points = drawing.plots.flatMap(plot => plot.points);
  const bounds = points.reduce((b, p) => ({
    xMin: Math.min(b.xMin, p.x), xMax: Math.max(b.xMax, p.x),
    yMin: Math.min(b.yMin, p.y), yMax: Math.max(b.yMax, p.y),
  }), { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity });
  const xRange = bounds.xMax - bounds.xMin || 1;
  const yRange = bounds.yMax - bounds.yMin || 1;
  const { x: xPad, y: yPad } = drawing.padding;
  const tick = (min: number, max: number, span: number, relativePadding: number) => {
    const desired = Math.max(4, Math.floor(span / (35 * texPoint)));
    const raw = (max - min) * (1 + 2 * relativePadding) / (desired - 1) || 1;
    const base = 10 ** Math.floor(Math.log10(raw));
    const multiple = raw / base;
    const step = (multiple < 1.5 ? 1 : multiple < 3.5 ? 2 : multiple < 7.5 ? 5 : 10) * base;
    const padding = (max - min) * relativePadding;
    const first = Math.ceil((min - padding) / step) * step;
    return Array.from({ length: Math.floor((max + padding - first) / step) + 1 }, (_, i) =>
      Number((first + i * step).toPrecision(10)));
  };
  const yTicks = drawing.yTicks.length ? drawing.yTicks : tick(bounds.yMin, bounds.yMax, axisHeight, yPad);
  const tickLabel = Math.max(0, ...yTicks.map(value => measureLatexRoman(String(value), 'cmr10', em) ?? String(value).length * em / 2));
  const tickInset = 5 * texPoint;
  const left = tickInset + tickLabel + (drawing.yLabel ? em + tickInset * 2 : 0);
  const right = left + axisWidth;
  const top = 0.5 * texPoint;
  const bottom = top + axisHeight;
  const width = right + top;
  const height = bottom + (drawing.xLabel ? 2.7 : 1.2) * em;
  const x = (value: number) => left + ((value - bounds.xMin) / xRange + xPad) / (1 + 2 * xPad) * axisWidth;
  const y = (value: number) => bottom - ((value - bounds.yMin) / yRange + yPad) / (1 + 2 * yPad) * axisHeight;
  const line = (a: Point, b: Point) => primitives.push({ kind: 'path', points: [a, b], stroke: '#212121', width: 0.5 });
  primitives.push({ kind: 'rect', x: left, y: top, width: axisWidth, height: axisHeight, stroke: '#000' });
  for (const value of drawing.xTicks.length ? drawing.xTicks : tick(bounds.xMin, bounds.xMax, axisWidth, xPad)) {
    if (x(value) < left || x(value) > right) continue;
    line({ x: x(value), y: bottom }, { x: x(value), y: bottom - 5 });
    line({ x: x(value), y: top }, { x: x(value), y: top + 5 });
    primitives.push({ kind: 'text', x: x(value), y: bottom + .78 * em, text: String(value), align: 'center' });
  }
  for (const value of yTicks) {
    if (y(value) < top || y(value) > bottom) continue;
    line({ x: left, y: y(value) }, { x: left + 5, y: y(value) });
    line({ x: right, y: y(value) }, { x: right - 5, y: y(value) });
    primitives.push({ kind: 'text', x: left - tickInset, y: y(value), text: String(value), align: 'right' });
  }
  primitives.push(
    { kind: 'text', x: (left + right) / 2, y: bottom + 2.2 * em, text: drawing.xLabel, align: 'center' },
    { kind: 'text', x: em * .85, y: (top + bottom) / 2, text: drawing.yLabel, align: 'center', rotate: true },
  );
  const cycle = ['#0000ff', '#ff0000', '#000000', '#757500'];
  const labels: { text: string; colour: string; marker: 'triangle'|'circle'|'none' }[] = [];
  drawing.plots.forEach((plot, index) => {
    const stroke = cycle[index % cycle.length]!;
    const path = plot.points.map(point => ({ x: x(point.x), y: y(point.y) }));
    primitives.push({ kind: 'path', points: path, stroke });
    if (plot.marker !== 'none') for (const position of path)
      primitives.push({ kind: 'dot', marker: plot.marker, ...position, colour: stroke });
    if (plot.legend) labels.push({ text: plot.legend, colour: stroke, marker: plot.marker });
  });
  if (labels.length) {
    const swatch = latexLength('0.6cm')!;
    const inset = 5 * texPoint;
    const gap = 4 * texPoint;
    const rowHeight = 0.84 * em + gap;
    const widths = labels.map(label =>
      label.text.split(/ +/).reduce(
        (sum, word, index) => sum + (index ? em / 3 : 0) +
          (measureLatexRoman(word, 'cmr10', em) ?? word.length * em / 2),
        0,
      ));
    const labelWidth = Math.max(...widths);
    const legendWidth = 2 * inset + swatch + gap + labelWidth;
    const legendHeight = labels.length * rowHeight + 4 * texPoint;
    const position = legendPositions.get(drawing.legendPosition ?? '') ??
      { x: 0.98, y: 0.02, west: false, north: true };
    const origin = {
      x: left + position.x * axisWidth - (position.west ? 0 : legendWidth),
      y: top + position.y * axisHeight - (position.north ? 0 : legendHeight),
    };
    primitives.push({ kind: 'rect', ...origin, width: legendWidth, height: legendHeight, fill: '#fff', stroke: '#000' });
    labels.forEach((label, index) => {
      const y = origin.y + 2 * texPoint + (index + 0.5) * rowHeight;
      const start = origin.x + inset;
      primitives.push({ kind: 'path', points: [{ x: start, y }, { x: start + swatch, y }], stroke: label.colour });
      if (label.marker !== 'none')
        primitives.push({ kind: 'dot', marker: label.marker, x: start + swatch / 2, y, colour: label.colour });
      const x = start + swatch + gap + (labelWidth - widths[index]!) / 2;
      primitives.push({ kind: 'text', x, y, text: label.text });
    });
  }
  return { width, height, primitives };
}
