import { tick } from 'svelte';
import { type PresentationSearchMatch, type PresentationSlide } from '@tumblerjs/slides';
import { presentationTextRange } from './presentation-text-range.ts';

const groups = new Map<symbol, { matches: Range[]; current: Range[] }>();
function paint() {
  if (!globalThis.CSS?.highlights || typeof Highlight === 'undefined') return;
  for (const [name, field] of [
    ['tumbler-slide-search', 'matches'],
    ['tumbler-slide-search-current', 'current'],
  ] as const) {
    const ranges = [...groups.values()].flatMap((group) => group[field]);
    if (ranges.length) {
      const highlight = new Highlight();
      for (const range of ranges) highlight.add(range);
      CSS.highlights.set(name, highlight);
    } else CSS.highlights.delete(name);
  }
}
interface Options {
  slide: PresentationSlide;
  matches: readonly PresentationSearchMatch[];
  current?: PresentationSearchMatch | undefined;
}
/** Paint matches without changing text markup, selection, document formatting or focus. */
export function presentationSearchHighlights(node: HTMLElement, initial: Options) {
  const key = Symbol();
  let generation = 0;
  async function update(options: Options) {
    const version = ++generation;
    await tick();
    if (generation !== version || !globalThis.CSS?.highlights || typeof Highlight === 'undefined')
      return;
    const group = { matches: [] as Range[], current: [] as Range[] };
    for (const match of options.matches) {
      const resolved = presentationTextRange(node, options.slide, match);
      if (!resolved) continue;
      const { range } = resolved;
      group.matches.push(range);
      if (match === options.current) group.current.push(range);
    }
    groups.set(key, group);
    paint();
  }
  void update(initial);
  return {
    update: (options: Options) => {
      void update(options);
    },
    destroy() {
      generation++;
      groups.delete(key);
      paint();
    },
  };
}
