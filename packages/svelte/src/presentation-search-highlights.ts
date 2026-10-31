import { tick } from 'svelte';
import {
  presentationTextTarget,
  slideTextValue,
  type PresentationSearchMatch,
  type PresentationSlide,
} from '@tumblerjs/slides';
import { presentationTextPosition } from './presentation-text-position.ts';

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
    const objects = Array.from(node.querySelectorAll<SVGElement>('[data-slide-object]'));
    for (const match of options.matches) {
      if (match.slideId !== options.slide.id) continue;
      const object = options.slide.objects.find((object) => object.key === match.objectKey);
      const element = objects.find((element) => element.dataset.slideObject === match.objectKey);
      if (!object || !element) continue;
      const root = match.cell
        ? Array.from(element.querySelectorAll<SVGElement>('[data-table-cell]')).find(
            (element) => element.dataset.tableCell === `${match.cell!.row}:${match.cell!.column}`,
          )
        : element;
      const paragraphs = root?.querySelector<HTMLElement>('.paragraphs');
      if (!paragraphs) continue;
      const value = slideTextValue(presentationTextTarget(object, match.cell)).split('\n');
      const range = document.createRange();
      range.setStart(...presentationTextPosition(paragraphs, value, match.start));
      range.setEnd(...presentationTextPosition(paragraphs, value, match.end));
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
