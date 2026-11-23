import { groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

export function latexEnvironmentName(open: string) {
  return /^\\begin\s*\{([^}]+)\}/.exec(open)?.[1];
}

export type LatexTheoremStyle = 'definition' | 'remark';
type Theorem = { title: string; counter?: string; within?: string; style?: LatexTheoremStyle };

export function readLatexTheorems(prefix: string) {
  const definitions = new Map<string, Theorem>();
  let style: LatexTheoremStyle | undefined;
  for (const { name, end } of latexCommands(prefix)) {
    if (name === 'theoremstyle') {
      const argument = groupAt(prefix, whitespaceEnd(prefix, end));
      const value = argument && prefix.slice(argument.from, argument.to).trim();
      style = value === 'definition' || value === 'remark' ? value : undefined;
      continue;
    }
    if (name !== 'newtheorem') continue;
    const starred = prefix[end] === '*';
    const environment = groupAt(prefix, whitespaceEnd(prefix, end + Number(starred)));
    if (!environment) continue;
    const shared = groupAt(prefix, whitespaceEnd(prefix, environment.end), '[', ']');
    const title = groupAt(prefix, whitespaceEnd(prefix, shared?.end ?? environment.end));
    if (!title) continue;
    const scope = groupAt(prefix, whitespaceEnd(prefix, title.end), '[', ']');
    const key = prefix.slice(environment.from, environment.to);
    definitions.set(key, {
      title: prefix.slice(title.from, title.to),
      ...(style && { style }),
      ...(!starred && { counter: shared ? prefix.slice(shared.from, shared.to) : key }),
      ...(scope && { within: prefix.slice(scope.from, scope.to) }),
    });
  }
  return definitions;
}

export function latexEnvironmentOption(open: string) {
  const tag = /^\\begin\s*\{[^}]+\}/.exec(open);
  if (!tag) return;
  const option = groupAt(open, whitespaceEnd(open, tag[0].length), '[', ']');
  if (option) return open.slice(option.from, option.to);
}

export function latexBoxTitle(open: string) {
  const option = latexEnvironmentOption(open)?.trim();
  const match = /^title\s*=\s*(?:\{([^{}]*)\}|([^{}]+))$/.exec(option ?? '');
  return match?.[1] ?? match?.[2];
}
