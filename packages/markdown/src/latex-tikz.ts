import { environmentAt, groupAt, whitespaceEnd } from './latex-syntax';

type State = {
  name: string;
  label: string;
  relative?: { direction: 'left' | 'right' | 'above' | 'below'; reference: string };
};

type Transition = { from: string; to: string; label: string; bend: -1 | 0 | 1 };

/** Read the ordinary TikZ automata/positioning subset without executing drawing macros. */
export function readLatexTikzStateDiagram(source: string) {
  const picture = environmentAt(source, whitespaceEnd(source, 0));
  if (picture?.name !== 'tikzpicture' || source.slice(picture.end).trim()) return;
  let start = whitespaceEnd(source, picture.from);
  const options = groupAt(source, start, '[', ']');
  const distance =
    options &&
    /(?:^|,)\s*node distance\s*=\s*(\d+(?:\.\d+)?)\s*(cm|mm)\s*(?=,|$)/.exec(
      source.slice(options.from, options.to),
    );
  if (options) {
    const flags = source
      .slice(options.from, options.to)
      .split(',')
      .map((flag) => flag.trim());
    if (
      flags.some(
        (flag) => flag && flag !== 'auto' && !(distance && flag.startsWith('node distance')),
      )
    )
      return;
    start = options.end;
  }
  const states: State[] = [];
  const transitions: Transition[] = [];
  const names = new Set<string>();
  for (const statement of source.slice(start, picture.to).trim().split(/;\s*/).filter(Boolean)) {
    const node =
      /^\\node\s*\[\s*state\s*(?:,\s*(left|right|above|below)\s*=\s*of\s+([\w-]+)\s*)?\]\s*\(([\w-]+)\)\s*\{([^{}\\]+)\}\s*$/.exec(
        statement,
      );
    if (node) {
      const [, direction, reference, name, label] = node;
      if (names.has(name!) || (reference && !names.has(reference)) || (!reference && states.length))
        return;
      names.add(name!);
      states.push({
        name: name!,
        label: label!,
        relative: reference
          ? { direction: direction as NonNullable<State['relative']>['direction'], reference }
          : undefined,
      });
      continue;
    }
    const draw = /^\\draw\s*\[\s*->\s*\]\s*/.exec(statement);
    if (!draw) return;
    const edge =
      /\s*\(([\w-]+)\)\s*edge\s*(?:\[\s*bend\s+(left|right)\s*\])?\s*(?:node\s*\{([^{}\\]*)\})?\s*\(([\w-]+)\)/y;
    let at = draw[0].length;
    while (statement.slice(at).trim()) {
      edge.lastIndex = at;
      const part = edge.exec(statement);
      if (!part || part[1] === part[4] || !names.has(part[1]!) || !names.has(part[4]!)) return;
      transitions.push({
        from: part[1]!,
        to: part[4]!,
        label: part[3] ?? '',
        bend: part[2] === 'left' ? -1 : part[2] === 'right' ? 1 : 0,
      });
      at = edge.lastIndex;
    }
  }
  if (states.length)
    return {
      states,
      transitions,
      separationMm: distance ? Number(distance[1]) * (distance[2] === 'cm' ? 10 : 1) : 10,
    };
}

type Point = { x: number; y: number };
type Ink = { width: number; height: number; depth: number };
type NodeBox = Point & { radius: number; text: string; ink: Ink };

const add = (a: Point, b: Point, multiplier = 1): Point => ({
  x: a.x + multiplier * b.x,
  y: a.y + multiplier * b.y,
});
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
const toward = (a: Point, b: Point) => add({ x: 0, y: 0 }, add(b, a, -1), 1 / (distance(a, b) || 1));
const turn = ({ x, y }: Point, angle: number): Point => ({
  x: x * Math.cos(angle) - y * Math.sin(angle),
  y: x * Math.sin(angle) + y * Math.cos(angle),
});
const directions = {
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  above: { x: 0, y: -1 }, below: { x: 0, y: 1 },
};

/** Arrange the circles and edges using TikZ's shape, positioning and bend defaults. */
export function layoutLatexTikzStateDiagram(
  model: NonNullable<ReturnType<typeof readLatexTikzStateDiagram>>,
  em: number,
  measure: (text: string) => Ink,
) {
  const inner = em / 3;
  const line = 0.4 * 96 / 72.27;
  const nodes = new Map<string, NodeBox>();
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  function include(x1: number, y1: number, x2: number, y2: number) {
    left = Math.min(left, x1);
    right = Math.max(right, x2);
    top = Math.min(top, y1);
    bottom = Math.max(bottom, y2);
  }
  for (const { name, label, relative } of model.states) {
    const ink = measure(label);
    const radius = Math.max(
      1.25 * em,
      Math.hypot(ink.width / 2 + inner, (ink.height + ink.depth) / 2 + inner),
    );
    const anchor = relative && nodes.get(relative.reference);
    const origin = relative && anchor
      ? add(anchor, directions[relative.direction], anchor.radius + radius + line + model.separationMm * 96 / 25.4)
      : { x: 0, y: 0 };
    nodes.set(name, { ...origin, radius, text: label, ink });
    const outer = radius + line / 2;
    include(origin.x - outer, origin.y - outer, origin.x + outer, origin.y + outer);
  }
  const edges = model.transitions.map(({ from, to, label, bend }) => {
    const a = nodes.get(from)!;
    const b = nodes.get(to)!;
    const axis = toward(a, b);
    const angle = bend * Math.PI / 6;
    const outward = turn(axis, angle);
    const inward = turn({ x: -axis.x, y: -axis.y }, -angle);
    const start = add(a, outward, a.radius + line / 2);
    const end = add(b, inward, b.radius + line / 2);
    // TikZ's default 'to' path uses this fraction of the distance between border anchors.
    const control = distance(start, end) * 0.3915;
    const first = add(start, outward, control);
    const second = add(end, inward, control);
    const midpoint = add(add(start, end), add(first, second), 3);
    midpoint.x /= 8;
    midpoint.y /= 8;
    const ink = measure(label);
    const normal = turn(toward(first, second), (bend || -1) * Math.PI / 2);
    const offset = inner + Math.max(Math.abs(normal.x) * ink.width, Math.abs(normal.y) * (ink.height + ink.depth)) / 2;
    const center = add(midpoint, normal, offset);
    const baseline = center.y + (ink.height - ink.depth) / 2;
    if (label) include(center.x - ink.width / 2, baseline - ink.height - inner, center.x + ink.width / 2, baseline + ink.depth + inner);
    include(midpoint.x - line / 2, midpoint.y - line / 2, midpoint.x + line / 2, midpoint.y + line / 2);
    return { start, first, second, end, label: { x: center.x, y: baseline, text: label } };
  });
  return {
    line, left, top, width: right - left, height: bottom - top,
    states: [...nodes.values()].map(({ x, y, radius, text, ink }) => ({
      x, y, radius, text, baseline: y + (ink.height - ink.depth) / 2,
    })),
    edges,
  };
}
