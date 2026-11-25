import type { LatexNumbering } from './latex-numbering';
import { groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

const titleCase = (name: string) => name.slice(0, 1).toUpperCase() + name.slice(1);
const abbreviations = new Map([
  ['equation', ['eq.', 'eqs.']],
  ['figure', ['fig.', 'figs.']],
  ['section', ['sec.', 'secs.']],
]);

function referenceNames(prefix: string) {
  const lower = new Map<string, readonly [string, string]>();
  const upper = new Map<string, readonly [string, string]>();
  let enabled = false;
  let unabbreviated = false;
  for (const command of latexCommands(prefix)) {
    const at = whitespaceEnd(prefix, command.end);
    if (command.name === 'usepackage' || command.name === 'RequirePackage') {
      const option = groupAt(prefix, at, '[', ']');
      const packages = groupAt(prefix, whitespaceEnd(prefix, option?.end ?? at));
      if (packages && prefix.slice(packages.from, packages.to).split(',').some(name => name.trim() === 'cleveref')) {
        enabled = true;
        unabbreviated = !!option && prefix.slice(option.from, option.to).split(',').some(name => name.trim() === 'noabbrev');
      }
    }
    if (command.name !== 'crefname' && command.name !== 'Crefname') continue;
    const type = groupAt(prefix, at);
    const singular = type && groupAt(prefix, whitespaceEnd(prefix, type.end));
    const plural = singular && groupAt(prefix, whitespaceEnd(prefix, singular.end));
    if (!type || !singular || !plural) continue;
    const name = prefix.slice(type.from, type.to);
    const forms = [prefix.slice(singular.from, singular.to), prefix.slice(plural.from, plural.to)] as const;
    (command.name === 'Crefname' ? upper : lower).set(name, forms);
  }
  if (enabled) return { lower, upper, unabbreviated };
}

/** Format ordinary and named references from the same labels used for heading and float numbering. */
export function latexPrintedReference(
  source: string,
  numbers: LatexNumbering | undefined,
  names: ReturnType<typeof referenceNames>,
) {
  const match = /^\\(ref|eqref|cref|Cref)\s*\{([^{}]+)\}$/.exec(source.trim());
  if (!match) return;
  const [, command, keys] = match;
  if (command === 'ref' || command === 'eqref') {
    const number = numbers?.labels.get(keys!.trim());
    return { text: number && (command === 'eqref' ? '(' + number + ')' : number) };
  }
  if (!names) return;
  const grouped = new Map<string, string[]>();
  for (const key of keys!.split(',').map(key => key.trim())) {
    const type = numbers?.labelTypes.get(key);
    const number = numbers?.labels.get(key);
    if (!type || number === undefined) return { text: undefined };
    const entries = grouped.get(type) ?? [];
    if (!entries.includes(number)) entries.push(number);
    grouped.set(type, entries);
  }
  const list = (items: readonly string[]) =>
    items.length < 2 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items.at(-1);
  const format = (type: string, values: string[]) => {
    const plural = values.length > 1;
    const form = plural ? 1 : 0;
    const lower = names.lower.get(type)?.[form];
    const upper = names.upper.get(type)?.[form];
    const abbreviation = names.unabbreviated ? undefined : abbreviations.get(type)?.[form];
    const fallback = abbreviation ?? type + (plural ? 's' : '');
    const name = command === 'Cref' ? upper ?? titleCase(lower ?? fallback) : lower ?? fallback;
    const sorted = [...values].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    return name + ' ' + list(type === 'equation' ? sorted.map(value => '(' + value + ')') : sorted);
  };
  return { text: list([...grouped].map(([type, values]) => format(type, values))) };
}

export { referenceNames as readLatexReferenceNames };
