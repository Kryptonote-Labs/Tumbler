import { WordError } from './document.ts';
import type { WordLayoutOptions, WordTextMeasurer } from './layout.ts';

const measurementSources = new WeakMap<WordTextMeasurer, WordTextMeasurer>();
export function measurementIdentity(measurer: WordTextMeasurer): WordTextMeasurer {
  return measurementSources.get(measurer) ?? measurer;
}

export interface PreparationBudget {
  readonly maxCharacters: number;
  readonly maxAtoms: number;
  readonly maxMeasurements: number;
  characters: number;
  atoms: number;
  measurements: number;
}

export function consumePreparation(budget: PreparationBudget | undefined, kind: 'characters' | 'atoms' | 'measurements', count = 1): void {
  if (!budget) return;
  const maximum = kind === 'characters' ? budget.maxCharacters : kind === 'atoms' ? budget.maxAtoms : budget.maxMeasurements;
  if (count > maximum - budget[kind]) throw new WordError('limit_exceeded', `Layout exceeds ${maximum} prepared ${kind}.`);
  budget[kind] += count;
}

/** One preparation budget covers body, nested tables, and repeated stories for a layout pass. */
export function createPreparation(measurer: WordTextMeasurer, options: Pick<WordLayoutOptions, 'maxCharacters' | 'maxAtoms' | 'maxMeasurements'>) {
  const limit = (value: number | undefined, fallback: number, name: string) => {
    const resolved = value ?? fallback;
    if (!Number.isSafeInteger(resolved) || resolved < 1) throw new RangeError(`Maximum ${name} count must be a positive safe integer.`);
    return resolved;
  };
  const budget: PreparationBudget = {
    maxCharacters: limit(options.maxCharacters, 5_000_000, 'character'),
    maxAtoms: limit(options.maxAtoms, 1_000_000, 'atom'),
    maxMeasurements: limit(options.maxMeasurements, 1_000_000, 'measurement'),
    characters: 0, atoms: 0, measurements: 0,
  };
  const bounded: WordTextMeasurer = { measure(text, format) {
    consumePreparation(budget, 'measurements');
    return measurer.measure(text, format);
  } };
  measurementSources.set(bounded, measurementIdentity(measurer));
  return { budget, measurer: bounded };
}
