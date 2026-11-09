import type { PdfDocument, PdfPage } from './document.ts';
import {
  PdfName,
  PdfReference,
  PdfString,
  bytesText,
  type PdfValue,
  type PdfDictionary,
} from './objects.ts';
import { pdfTextString } from './annotations.ts';
import { transform } from './matrix.ts';
import { pageViewport } from './scene.ts';

/** Coordinates use the source page's rotated, cropped viewport, in points. */
export type PdfDestination = { kind: 'internal'; pageId: string; x: number; y: number };
export type PdfLinkTarget = PdfDestination | { kind: 'external'; uri: string };
export type PdfLink = { rect: readonly [number, number, number, number]; target: PdfLinkTarget };
export type PdfOutlineEntry = {
  title: string;
  target?: PdfLinkTarget | undefined;
  children: PdfOutlineEntry[];
};

/** Resolve navigation without interpreting page content or executing PDF actions. */
export class PdfNavigation {
  constructor(readonly document: PdfDocument) {}
  destination(value: PdfValue | undefined): PdfDestination | undefined {
    const source = this.document.source,
      seen = new Set<PdfValue>(),
      names = new Set<string>();
    const resolve = (value: PdfValue | undefined): PdfDestination | undefined => {
      const resolved = source.resolve(value);
      if (seen.has(resolved)) return;
      seen.add(resolved);
      if (Array.isArray(resolved)) {
        const ref = resolved[0];
        const page =
          ref instanceof PdfReference
            ? this.document.pages.find((p) => p.id === ref.key)
            : undefined;
        if (!page) return;
        const mode = source.resolve(resolved[1]);
        if (!(mode instanceof PdfName)) return;
        const coordinate = (index: number, fallback: number) => {
          const n = source.resolve(resolved[index]);
          return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
        };
        const [left, , , top] = page.cropBox;
        let x = left,
          y = top;
        switch (mode.value) {
          case 'XYZ':
          case 'FitR':
            x = coordinate(2, left);
            y = coordinate(mode.value === 'FitR' ? 5 : 3, top);
            break;
          case 'FitH':
          case 'FitBH':
            y = coordinate(2, top);
            break;
          case 'FitV':
          case 'FitBV':
            x = coordinate(2, left);
            break;
          case 'Fit':
          case 'FitB':
            break;
          default:
            return;
        }
        const point = transform(pageViewport(page), x, y);
        return { kind: 'internal', pageId: page.id, x: point[0], y: point[1] };
      }
      if (resolved instanceof Map) return resolve(resolved.get('D'));
      const key =
        resolved instanceof PdfName
          ? resolved.value
          : resolved instanceof PdfString
            ? bytesText(resolved.bytes)
            : undefined;
      if (key === undefined || names.has(key)) return;
      names.add(key);
      const legacy = source.resolve(source.catalog.get('Dests'));
      if (legacy instanceof Map && legacy.has(key)) return resolve(legacy.get(key));
      const catalogNames = source.resolve(source.catalog.get('Names'));
      const visited = new Set<PdfValue>();
      const pending = catalogNames instanceof Map ? [catalogNames.get('Dests')] : [];
      while (pending.length) {
        const node = source.resolve(pending.pop());
        if (!(node instanceof Map) || visited.has(node)) continue;
        visited.add(node);
        const entries = source.resolve(node.get('Names'));
        if (Array.isArray(entries))
          for (let i = 0; i + 1 < entries.length; i += 2) {
            const name = source.resolve(entries[i]);
            if (name instanceof PdfString && bytesText(name.bytes) === key)
              return resolve(entries[i + 1]);
          }
        const kids = source.resolve(node.get('Kids'));
        if (Array.isArray(kids)) pending.push(...kids);
      }
    };
    return resolve(value);
  }
  target(dictionary: PdfDictionary): PdfLinkTarget | undefined {
    const source = this.document.source;
    if (dictionary.has('Dest')) return this.destination(dictionary.get('Dest'));
    const action = source.resolve(dictionary.get('A'));
    if (!(action instanceof Map)) return;
    const kind = source.resolve(action.get('S'));
    if (!(kind instanceof PdfName)) return;
    if (kind.value === 'GoTo') return this.destination(action.get('D'));
    const uri = source.resolve(action.get('URI'));
    if (kind.value === 'URI' && uri instanceof PdfString)
      return { kind: 'external', uri: pdfTextString(uri) };
  }
  links(page: PdfPage): PdfLink[] {
    const source = this.document.source,
      values = source.resolve(page.dictionary.get('Annots'));
    if (!Array.isArray(values)) return [];
    return values.flatMap((value): PdfLink[] => {
      const annotation = source.resolve(value);
      if (!(annotation instanceof Map)) return [];
      const subtype = source.resolve(annotation.get('Subtype')),
        flags = source.resolve(annotation.get('F'));
      if (
        !(subtype instanceof PdfName) ||
        subtype.value !== 'Link' ||
        (typeof flags === 'number' && flags & 35)
      )
        return [];
      const rect = source.resolve(annotation.get('Rect')),
        target = this.target(annotation);
      if (
        !target ||
        !Array.isArray(rect) ||
        rect.length !== 4 ||
        !rect.every((n) => typeof n === 'number' && Number.isFinite(n))
      )
        return [];
      const corners = [
        [rect[0]!, rect[1]!],
        [rect[2]!, rect[3]!],
      ].map(([x, y]) => transform(pageViewport(page), x as number, y as number));
      return [
        {
          target,
          rect: [
            Math.min(corners[0]![0], corners[1]![0]),
            Math.min(corners[0]![1], corners[1]![1]),
            Math.max(corners[0]![0], corners[1]![0]),
            Math.max(corners[0]![1], corners[1]![1]),
          ],
        },
      ];
    });
  }
  outline(): PdfOutlineEntry[] {
    const source = this.document.source,
      seen = new Set<PdfValue>();
    const root = source.resolve(source.catalog.get('Outlines'));
    const read = (first: PdfValue | undefined): PdfOutlineEntry[] => {
      const entries: PdfOutlineEntry[] = [];
      let next = first;
      while (next) {
        const item = source.resolve(next);
        if (!(item instanceof Map) || seen.has(item)) break;
        seen.add(item);
        const title = source.resolve(item.get('Title'));
        entries.push({
          title: title instanceof PdfString ? pdfTextString(title) : '',
          target: this.target(item),
          children: read(item.get('First')),
        });
        next = item.get('Next');
      }
      return entries;
    };
    return root instanceof Map ? read(root.get('First')) : [];
  }
}

/** Browser consumers must still open with noopener and noreferrer. */
export function isSafePdfUri(uri: string): boolean {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(uri).protocol);
  } catch {
    return false;
  }
}
