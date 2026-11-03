import { PdfInterpreter } from '../interpreter.ts';
import { pdfTextContent, type PdfTextItem } from '../text-content.ts';
import type { PdfDocument } from '../document.ts';
import type { PdfSceneSource } from '../scene.ts';
import { defaultPdfTextStyle, type PdfTextStyle } from './fonts.ts';

export type PdfTextSeed = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  lineHeight: number;
  style: PdfTextStyle;
  sources: {
    instance: string;
    object: string;
    start: number;
    end: number;
    mode: number;
    displacement: number;
  }[];
  delta: { insert: string; attributes: PdfTextStyle }[];
};
export const pdfSourceKey = (s: Pick<PdfSceneSource, 'instance' | 'object' | 'start'>) =>
  `${s.instance}/${s.object.key}/${s.start}`;
function styleOf(item: PdfTextItem, color: string): PdfTextStyle {
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(color);
  if (rgb)
    color =
      '#' +
      rgb
        .slice(1)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('');
  return {
    ...defaultPdfTextStyle,
    size: Math.hypot(item.transform[0], item.transform[1]),
    bold: item.font.weight === 'bold',
    italic: item.font.style === 'italic',
    family:
      /serif/i.test(item.font.family) && !/sans/i.test(item.font.family)
        ? 'Serif'
        : /mono/i.test(item.font.family)
          ? 'Mono'
          : 'Sans',
    color,
  };
}
/** Geometric paragraph recovery preserves source ownership. Shared showing operators never split between regions. */
export function importPdfText(document: PdfDocument): PdfTextSeed[] {
  const interpreter = new PdfInterpreter(document),
    blocks: PdfTextSeed[] = [];
  for (const page of document.pages) {
    const scene = interpreter.page(page.index),
      glyphs = new Map(scene.elements.filter((e) => e.kind === 'glyph').map((e) => [e.id, e]));
    const lines: PdfTextItem[][] = [];
    for (const item of pdfTextContent(scene).items) {
      if (!lines.length || item.text === '\n') lines.push([]);
      if (item.text !== '\n') lines.at(-1)!.push(item);
    }
    let previous: PdfTextSeed | undefined;
    for (const line of lines.filter((l) => l.length)) {
      const first = line[0]!,
        last = line.at(-1)!,
        glyph = glyphs.get(first.id);
      const style = styleOf(
        first,
        typeof glyph?.state.fill === 'string' ? glyph.state.fill : '#000000',
      );
      const x = first.transform[4],
        y = first.transform[5],
        right = last.transform[4] + last.width * style.size;
      const sourceMap = new Map<string, PdfTextSeed['sources'][number]>();
      for (const item of line) {
        const g = glyphs.get(item.id);
        if (!g) continue;
        const key = pdfSourceKey(g.source),
          previous = sourceMap.get(key);
        sourceMap.set(key, {
          ...g.source,
          object: g.source.object.key,
          mode: g.mode,
          displacement: (previous?.displacement ?? 0) + g.textDisplacement,
        });
      }
      const sources = [...sourceMap.values()];

      const delta = line.map((item) => ({
        insert: item.text,
        attributes: styleOf(item, style.color),
      }));
      const gap = previous ? y - previous.y : 0;
      const previousLines =
        previous?.delta
          .map((d) => d.insert)
          .join('')
          .split('\n').length ?? 1;
      const sameOperator = previous?.sources.some((a) =>
        sources.some(
          (b) => a.instance === b.instance && a.object === b.object && a.start === b.start,
        ),
      );
      const follows =
        previous &&
        Math.abs(x - previous.x) < style.size &&
        Math.abs(style.size - previous.style.size) < 0.2 &&
        gap > 0 &&
        gap / previousLines < style.size * 1.7;
      if (previous && (sameOperator || follows)) {
        previous.delta.push({ insert: '\n', attributes: style }, ...delta);
        for (const source of sources) {
          const existing = previous.sources.find(
            (s) =>
              s.object === source.object &&
              s.instance === source.instance &&
              s.start === source.start,
          );
          if (existing) existing.displacement += source.displacement;
          else previous.sources.push(source);
        }
        previous.lineHeight = gap / previousLines || style.size * 1.2;
      } else {
        previous = {
          id: `source:${page.id}:${blocks.length}`,
          page: page.index,
          x,
          y,
          width: Math.max(right - x, page.width - x - Math.min(x, 48)),
          lineHeight: style.size * 1.25,
          style,
          sources,
          delta,
        };
        blocks.push(previous);
      }
    }
    interpreter.releasePage(page.index);
  }
  return blocks;
}
