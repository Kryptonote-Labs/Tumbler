import { latexLength } from './latex-lengths';
import { argumentAt, commandEnd, environmentAt, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

type Point = { x: number; y: number };
type PictureObject = Point & (
  | { kind: 'label'; text: string; height: number }
  | { kind: 'rectangle'; width: number; height: number }
);
type Drawing =
  | { kind: 'picture'; width: number; height: number; objects: PictureObject[]; end: number }
  | { kind: 'axis'; width: string; height: number; xLabel: string; yLabel: string; xTicks: number[]; plots: { points: Point[]; marker: 'circle' | 'triangle' | 'none'; legend?: string }[]; end: number };

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
  const xTicks = (values.get('xtick') ?? '').split(',').filter(v => v.trim()).map(Number);
  if (xTicks.some(x => !Number.isFinite(x))) return;
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
    kind: 'axis', width: values.get('width') ?? '8cm', height, xTicks, plots,
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
  const width = linewidth ? Number(linewidth[1] ?? 1) * bodyWidth : latexLength(drawing.width, em);
  const height = drawing.height;
  if (!width || !Number.isFinite(width) || width <= 0) return;
  const margin = { left: 2.15 * em, right: 0.35 * em, top: 0.35 * em, bottom: 2.5 * em };
  const left = margin.left;
  const right = width - margin.right;
  const top = margin.top;
  const bottom = height - margin.bottom;
  if (right <= left || bottom <= top) return;
  const points = drawing.plots.flatMap(plot => plot.points);
  const bounds = points.reduce((b, p) => ({
    xMin: Math.min(b.xMin, p.x), xMax: Math.max(b.xMax, p.x),
    yMin: Math.min(b.yMin, p.y), yMax: Math.max(b.yMax, p.y),
  }), { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity });
  const xRange = bounds.xMax - bounds.xMin || 1;
  const yRange = bounds.yMax - bounds.yMin || 1;
  const x = (value: number) => left + ((value - bounds.xMin) / xRange + 0.05) / 1.1 * (right - left);
  const y = (value: number) => bottom - ((value - bounds.yMin) / yRange + 0.05) / 1.1 * (bottom - top);
  const line = (a: Point, b: Point) => primitives.push({ kind: 'path', points: [a, b], stroke: '#212121', width: 0.5 });
  primitives.push({ kind: 'rect', x: left, y: top, width: right - left, height: bottom - top, stroke: '#000' });
  const tick = (min: number, max: number) => {
    const raw = (max - min) / 6 || 1;
    const base = 10 ** Math.floor(Math.log10(raw));
    const step = ([1,2,5,10].find(value => value * base >= raw) ?? 10) * base;
    const first = Math.ceil(min / step) * step;
    return Array.from({ length: Math.floor((max - first) / step) + 1 }, (_, i) => Number((first + i * step).toPrecision(10)));
  };
  for (const value of drawing.xTicks.length ? drawing.xTicks : tick(bounds.xMin, bounds.xMax)) {
    if (x(value) < left || x(value) > right) continue;
    line({ x: x(value), y: bottom }, { x: x(value), y: bottom - 5 });
    line({ x: x(value), y: top }, { x: x(value), y: top + 5 });
    primitives.push({ kind: 'text', x: x(value), y: bottom + .78 * em, text: String(value), align: 'center' });
  }
  for (const value of tick(bounds.yMin, bounds.yMax)) {
    line({ x: left, y: y(value) }, { x: left + 5, y: y(value) });
    line({ x: right, y: y(value) }, { x: right - 5, y: y(value) });
    primitives.push({ kind: 'text', x: left - 5, y: y(value), text: String(value), align: 'right' });
  }
  primitives.push(
    { kind: 'text', x: (left + right) / 2, y: bottom + 1.9 * em, text: drawing.xLabel, align: 'center' },
    { kind: 'text', x: em * .4, y: (top + bottom) / 2, text: drawing.yLabel, align: 'center', rotate: true },
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
    const legendWidth = Math.max(...labels.map(label => label.text.length)) * em * .51 + 2.35 * em;
    const legendHeight = (labels.length + .55) * em;
    const origin = { x: right - legendWidth - .4 * em, y: bottom - legendHeight - .4 * em };
    primitives.push({ kind: 'rect', ...origin, width: legendWidth, height: legendHeight, fill: '#fff', stroke: '#000' });
    labels.forEach((label, index) => {
      const y = origin.y + (.78 + index) * em;
      const start = origin.x + .28 * em;
      primitives.push({ kind: 'path', points: [{ x:start,y },{ x:start+1.3*em,y }], stroke: label.colour });
      if (label.marker !== 'none') primitives.push({ kind:'dot', marker:label.marker, x:start+.65*em, y, colour:label.colour });
      primitives.push({ kind:'text', x:start+1.55*em, y, text:label.text });
    });
  }
  return { width, height, primitives };
}
