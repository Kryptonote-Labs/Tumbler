import { sha256 } from '@noble/hashes/sha2.js';
import * as Y from 'yjs';
import type { PdfDocument, PdfPage } from '../document.ts';
import { PdfName, type PdfValue } from '../objects.ts';
import { pageViewport } from '../scene.ts';
import { inverse, transform as transformPoint } from '../matrix.ts';
import { PdfWriter, bytes, n } from './object-writer.ts';
export type PdfMarkupKind = 'Highlight' | 'Underline' | 'StrikeOut';
/** Quad points use PDF user space, in top-left, top-right, bottom-left, bottom-right order. */
export type PdfMarkup = {
  id: string;
  page: number;
  continuation: number;
  kind: PdfMarkupKind;
  color: string;
  quads: number[][];
  hidden: boolean;
};
const kinds = ['Highlight', 'Underline', 'StrikeOut'];
export function validatePdfMarkup(value: PdfMarkup) {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !value.id ||
    !Number.isSafeInteger(value.page) ||
    !Number.isSafeInteger(value.continuation) ||
    value.continuation < 0 ||
    !kinds.includes(value.kind) ||
    !/^#[\da-f]{6}$/i.test(value.color) ||
    typeof value.hidden !== 'boolean' ||
    !Array.isArray(value.quads) ||
    !value.quads.length ||
    value.quads.some(
      (q) =>
        !Array.isArray(q) ||
        q.length !== 8 ||
        q.some((v) => typeof v !== 'number' || !Number.isFinite(v)),
    )
  )
    throw new Error('Invalid PDF markup.');
}
const imports = new WeakMap<PdfDocument, PdfMarkup[]>();
export function importPdfMarkup(document: PdfDocument) {
  const cached = imports.get(document);
  if (cached) return cached;
  const result: PdfMarkup[] = [];
  for (const page of document.pages) {
    const annots = document.source.resolve(page.dictionary.get('Annots'));
    if (!Array.isArray(annots)) continue;
    annots.forEach((raw, index) => {
      const info = document.source.resolve(raw);
      if (!(info instanceof Map)) return;
      const subtype = info.get('Subtype');
      const quad = document.source.resolve(info.get('QuadPoints'));
      if (
        !(subtype instanceof PdfName) ||
        !kinds.includes(subtype.value) ||
        !Array.isArray(quad) ||
        !quad.length ||
        quad.length % 8 ||
        quad.some((v) => typeof v !== 'number' || !Number.isFinite(v))
      )
        return;
      const c = document.source.resolve(info.get('C'));
      const color =
        Array.isArray(c) &&
        c.length === 3 &&
        c.every((v) => typeof v === 'number' && v >= 0 && v <= 1)
          ? '#' +
            c
              .map((v) =>
                Math.round(Number(v) * 255)
                  .toString(16)
                  .padStart(2, '0'),
              )
              .join('')
          : '#ffff00';
      const quads: number[][] = [];
      for (let i = 0; i < quad.length; i += 8) quads.push(quad.slice(i, i + 8) as number[]);
      result.push({
        id: `annotation:${page.id}:${index}`,
        page: page.index,
        continuation: 0,
        kind: subtype.value as PdfMarkupKind,
        color,
        quads,
        hidden: !!(Number(info.get('F') ?? 0) & 35),
      });
    });
  }
  imports.set(document, result);
  return result;
}
/** Shared overrides leave unsupported annotations and untouched appearance streams intact. */
export class PdfMarkupModel {
  readonly records: Y.Map<Y.Map<unknown>>;
  constructor(
    private doc: Y.Doc,
    private origin: object,
    private materialize: (page: number) => void,
  ) {
    this.records = doc.getMap('pdf-markup');
  }
  items(document: PdfDocument): PdfMarkup[] {
    const result = new Map(importPdfMarkup(document).map((a) => [a.id, a]));
    for (const [id, record] of this.records) result.set(id, record.toJSON() as PdfMarkup);
    return [...result.values()];
  }
  set(value: PdfMarkup) {
    validatePdfMarkup(value);
    if (!this.records.has(value.id)) {
      this.doc.transact(() => {
        const record = new Y.Map<unknown>();
        this.records.set(value.id, record);
        for (const [key, v] of Object.entries({ ...value, hidden: true })) record.set(key, v);
      }, 'import');
    }
    this.doc.transact(() => {
      if (!value.hidden) this.materialize(value.page);
      const record = this.records.get(value.id)!;
      for (const [key, v] of Object.entries(value))
        if (JSON.stringify(record.get(key)) !== JSON.stringify(v)) record.set(key, v);
    }, this.origin);
  }
  /** Bootstrap imported ownership identically on every peer before applying a local patch. */
  update(
    document: PdfDocument,
    id: string,
    patch: Partial<Pick<PdfMarkup, 'color' | 'kind' | 'hidden'>>,
  ) {
    const original = importPdfMarkup(document).find((a) => a.id === id);
    if (!this.records.has(id) && original) {
      const seed = new Y.Doc(),
        digest = sha256(bytes(id));
      seed.clientID = digest.subarray(0, 6).reduce((v, b) => v * 256 + b, 0) + 0x100000000;
      const record = new Y.Map<unknown>();
      seed.getMap<Y.Map<unknown>>('pdf-markup').set(id, record);
      for (const [key, value] of Object.entries(original)) record.set(key, value);
      Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(seed), 'import');
      seed.destroy();
    }
    const current = this.items(document).find((a) => a.id === id);
    if (!current) throw new Error('Unknown PDF markup.');
    this.set({ ...current, ...patch });
  }
  validate(pages: ReadonlySet<number>) {
    for (const [id, record] of this.records) {
      if (!(record instanceof Y.Map)) throw new Error('Invalid PDF markup record.');
      const value = record.toJSON() as PdfMarkup;
      validatePdfMarkup(value);
      if (
        id !== value.id ||
        !pages.has(value.page) ||
        [...record.keys()].some(
          (k) => !['id', 'page', 'continuation', 'kind', 'color', 'quads', 'hidden'].includes(k),
        )
      )
        throw new Error('Invalid PDF markup ownership.');
    }
  }
}
export function pdfMarkupFromRects(
  page: PdfPage,
  rects: readonly { x: number; y: number; width: number; height: number }[],
) {
  const transform = inverse(pageViewport(page));
  return rects.map((r) =>
    [
      [r.x, r.y],
      [r.x + r.width, r.y],
      [r.x, r.y + r.height],
      [r.x + r.width, r.y + r.height],
    ].flatMap(([x, y]) => transformPoint(transform, x!, y!)),
  );
}
export function writePdfMarkup(
  writer: PdfWriter,
  document: PdfDocument,
  page: PdfPage,
  continuation: number,
  annotations: PdfMarkupModel,
  info: Map<string, PdfValue>,
) {
  const raw = continuation ? [] : page.index < 0 ? info.get('Annots') : document.source.resolve(page.dictionary.get('Annots'));
  const originals = Array.isArray(raw) ? raw : [];
  const retained = originals.filter(
    (_, i) => !annotations.records.has(`annotation:${page.id}:${i}`),
  );
  for (const a of annotations
    .items(document)
    .filter(
      (a) =>
        a.page === page.index &&
        a.continuation === continuation &&
        !a.hidden &&
        annotations.records.has(a.id),
    )) {
    const xs = a.quads.flatMap((q) => [q[0]!, q[2]!, q[4]!, q[6]!]),
      ys = a.quads.flatMap((q) => [q[1]!, q[3]!, q[5]!, q[7]!]);
    const rect = [
      Math.min(...xs) - 1,
      Math.min(...ys) - 1,
      Math.max(...xs) + 1,
      Math.max(...ys) + 1,
    ];
    const rgb = [1, 3, 5].map((i) => parseInt(a.color.slice(i, i + 2), 16) / 255);
    let content = `q ${rgb.map(n).join(' ')} rg ${rgb.map(n).join(' ')} RG 1 w\n`;
    if (a.kind === 'Highlight') content += '/GS gs\n';
    for (const q of a.quads) {
      if (a.kind === 'Highlight')
        content += `${n(q[0]!)} ${n(q[1]!)} m ${n(q[2]!)} ${n(q[3]!)} l ${n(q[6]!)} ${n(q[7]!)} l ${n(q[4]!)} ${n(q[5]!)} l h f\n`;
      else {
        const t = a.kind === 'StrikeOut' ? 0.5 : 0.9;
        content += `${n(q[0]! * (1 - t) + q[4]! * t)} ${n(q[1]! * (1 - t) + q[5]! * t)} m ${n(q[2]! * (1 - t) + q[6]! * t)} ${n(q[3]! * (1 - t) + q[7]! * t)} l S\n`;
      }
    }
    const appearance = writer.stream(
      bytes(content + 'Q'),
      new Map<string, PdfValue>([
        ['Type', new PdfName('XObject')],
        ['Subtype', new PdfName('Form')],
        ['BBox', rect],
        [
          'Resources',
          new Map([
            [
              'ExtGState',
              new Map([
                [
                  'GS',
                  new Map<string, PdfValue>([
                    ['Type', new PdfName('ExtGState')],
                    ['ca', 0.35],
                    ['BM', new PdfName('Multiply')],
                  ]),
                ],
              ]),
            ],
          ]),
        ],
      ]),
    );
    const originalIndex = importPdfMarkup(document).find((v) => v.id === a.id);
    const original =
      originalIndex && document.source.resolve(originals[Number(a.id.split(':').at(-1))]);
    const dictionary = original instanceof Map ? new Map(original) : new Map<string, PdfValue>();
    for (const [key, value] of new Map<string, PdfValue>([
      ['Type', new PdfName('Annot')],
      ['Subtype', new PdfName(a.kind)],
      ['Rect', rect],
      ['QuadPoints', a.quads.flat()],
      ['C', rgb],
      ['F', 4],
      ['AP', new Map([['N', appearance]])],
    ]))
      dictionary.set(key, value);
    retained.push(writer.value(dictionary));
  }
  if (originals.length || retained.length) info.set('Annots', retained);
}

export function pdfMarkupDisplayQuads(page: PdfPage, annotation: PdfMarkup) {
  return annotation.quads.map((q) =>
    [0, 2, 4, 6].flatMap((i) => transformPoint(pageViewport(page), q[i]!, q[i + 1]!)),
  );
}
