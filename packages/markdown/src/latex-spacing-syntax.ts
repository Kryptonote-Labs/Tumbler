import { argument, commandEnd, whitespaceEnd } from './latex-syntax';

export function latexStretch(value: string | undefined) {
  const literal = value?.trim();
  if (!literal || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(literal)) return;
  const stretch = Number(literal);
  if (stretch > 0 && Number.isFinite(stretch)) return stretch;
}

/** A standalone spacing declaration and the source it consumes. */
export function readLatexSpacingCommand(source: string, start: number) {
  const end = commandEnd(source, start);
  const name = source.slice(start + 1, end);
  const preset: 'single' | 'onehalf' | 'double' | undefined = name === 'singlespacing' ? 'single' : name === 'onehalfspacing' ? 'onehalf' :
    name === 'doublespacing' ? 'double' : undefined;
  if (preset) return { kind: 'preset' as const, preset, end };
  if (name !== 'linespread' && name !== 'setstretch' && name !== 'renewcommand' && name !== 'SetSinglespace') return;
  const first = argument(source, end);
  const bare = whitespaceEnd(source, end);
  const target = name === 'renewcommand'
    ? first?.value === '\\baselinestretch' ? first.end
      : source.slice(bare, commandEnd(source, bare)) === '\\baselinestretch' ? commandEnd(source, bare)
      : undefined
    : undefined;
  const value = name === 'renewcommand' ? target !== undefined && argument(source, target) : first;
  if (!value) return;
  const stretch = latexStretch(value.value);
  if (stretch === undefined) return;
  const next = whitespaceEnd(source, value.end);
  const nextEnd = commandEnd(source, next);
  const sizeReset = source.slice(next, nextEnd) === '\\normalsize';
  return { kind: 'multiple' as const, command: name, stretch, end: sizeReset ? nextEnd : value.end };
}
