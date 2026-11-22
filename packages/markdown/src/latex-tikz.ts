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
