import { consumePreparation, type PreparationBudget } from './layout-preparation.ts';

/** Batch ASCII word spans for shaping, preserving spaces, punctuation and other graphemes.
 * Chunk size bounds shaping work. It does not add a wrapping opportunity or limit text length.
 */
export function* wordShapeGroups(graphemes: Iterable<string>, enabled: boolean, preparation?: PreparationBudget) {
  let text = '', count = 0;
  for (const grapheme of graphemes) {
    consumePreparation(preparation, 'atoms');
    if (enabled && /^[A-Za-z0-9]+$/.test(grapheme)) {
      text += grapheme;
      count++;
      if (count === 32) { yield { text, count }; text = ''; count = 0; }
    } else {
      if (text) yield { text, count };
      text = ''; count = 0;
      yield { text: grapheme, count: 1 };
    }
  }
  if (text) yield { text, count };
}
