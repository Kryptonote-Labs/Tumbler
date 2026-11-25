import { latexBaseSize, readLatexClass } from './latex-class';
import { readLatexTextMacros } from './latex-macros';
import { readLatexPackages } from './latex-preamble';
import { readLatexStateMacro } from './latex-state-command';
import { latexStretch, readLatexSpacingCommand } from './latex-spacing-syntax';
import { argument, commandEnd, latexCommands } from './latex-syntax';

export const spacingCommands = {
  single: 'singlespacing',
  onehalf: 'onehalfspacing',
  double: 'doublespacing',
} as const;

type Preset = keyof typeof spacingCommands;
export type LatexLineSpacingChoice = Preset | { multiple: string };
type Spacing = { mode: Preset | 'custom'; stretch: number };

export function latexPresetStretch(preset: Preset, points: number, className: string) {
  // setspace tests \@ptsize for 0, 1 and 2. Extsizes uses the full option number.
  const size = !className.startsWith('ext') && points === 12 ? 2 :
    !className.startsWith('ext') && points === 11 ? 1 : 0;
  return preset === 'single' ? 1 :
    preset === 'onehalf' ? [1.25, 1.213, 1.241][size]! : [1.667, 1.618, 1.655][size]!;
}

/** Resolve the literal spacing declarations and simple setup macros executed by a preamble. */
export function latexLineSpacing(prefix: string, points = latexBaseSize(prefix)): Spacing {
  let spacing: Spacing = { mode: 'single', stretch: 1 };
  let single = 1;
  const { name: className } = readLatexClass(prefix);
  const setspace = readLatexPackages(prefix).find((entry) => entry.name === 'setspace');
  const macros = readLatexTextMacros(prefix);
  const preset = (mode: Preset) => {
    spacing = { mode, stretch: mode === 'single' ? single : latexPresetStretch(mode, points, className) };
  };
  const apply = (source: string, start: number, loaded: boolean) => {
    const value = readLatexSpacingCommand(source, start);
    if (!value) return;
    if (value.kind === 'preset') {
      if (loaded) preset(value.preset);
    } else if (value.command === 'SetSinglespace') {
      if (loaded) single = value.stretch;
    } else if (value.command !== 'setstretch' || loaded) {
      spacing = { mode: value.command === 'setstretch' && value.stretch === 1 ? 'single' : 'custom', stretch: value.stretch };
    }
  };
  for (const { name, start, end } of latexCommands(prefix)) {
    if (name === 'begin' && argument(prefix, end)?.value === 'document') continue;
    if (start === setspace?.offset) {
      for (const mode of ['single', 'onehalf', 'double'] as const)
        if (setspace.options.includes(spacingCommands[mode])) preset(mode);
    }
    const loaded = !!setspace && start > setspace.offset;
    apply(prefix, start, loaded);
    const call = readLatexStateMacro(prefix, macros, start);
    if (call)
      for (const command of latexCommands(call.expansion)) apply(call.expansion, command.start, loaded);
  }
  return spacing;
}

/** Parse the opener of a setspace environment without consuming its body. */
export function latexSpacingRegion(source: string, start = 0) {
  const end = commandEnd(source, start);
  if (source.slice(start, end) !== '\\begin') return;
  const name = argument(source, end);
  if (!name) return;
  switch (name.value) {
    case 'singlespace':
    case 'singlespace*':
    case 'onehalfspace':
    case 'doublespace':
      return { name: name.value, end: name.end };
    case 'spacing': {
      const value = argument(source, name.end);
      const stretch = latexStretch(value?.value);
      if (value && stretch !== undefined) return { name: name.value, stretch, end: value.end };
    }
  }
}

export function latexSpacingValue(choice: LatexLineSpacingChoice) {
  if (typeof choice === 'string') return choice;
  if (latexStretch(choice.multiple) === undefined) throw new Error('Enter a positive spacing multiple.');
  return choice.multiple.trim();
}
