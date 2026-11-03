import * as Y from 'yjs';
import type { PdfTextStyle } from './fonts.ts';
import type { PdfTextSeed } from './import-text.ts';
export { importPdfText, pdfSourceKey, type PdfTextSeed } from './import-text.ts';

export class PdfTextModel {
  readonly regions: Y.Map<Y.Map<unknown>>;
  readonly origin = {};
  readonly undo: Y.UndoManager;
  constructor(readonly doc: Y.Doc = new Y.Doc()) {
    this.regions = doc.getMap('pdf-text');
    this.undo = new Y.UndoManager(this.regions, { trackedOrigins: new Set([this.origin]) });
  }
  initialize(seeds: PdfTextSeed[]) {
    if (this.regions.size) return;
    this.doc.transact(() => {
      for (const seed of seeds) this.add(seed, false);
    }, 'import');
  }
  add(seed: PdfTextSeed, local = true) {
    this.doc.transact(
      () => {
        const region = new Y.Map<unknown>();
        this.regions.set(seed.id, region);
        region.set('seed', seed);
        const text = new Y.Text();
        region.set('text', text);
        text.applyDelta(seed.delta);
      },
      local ? 'create' : 'import',
    );
    return seed.id;
  }
  seed(id: string): PdfTextSeed {
    const value = this.regions.get(id)?.get('seed');
    if (!value || typeof value !== 'object' || !('id' in value))
      throw new Error('Unknown PDF text region.');
    return value as PdfTextSeed;
  }
  text(id: string): Y.Text {
    const text = this.regions.get(id)?.get('text');
    if (!(text instanceof Y.Text)) throw new Error('Unknown PDF text region.');
    return text;
  }
  ids(page?: number) {
    return [...this.regions.keys()]
      .filter((id) => page === undefined || this.seed(id).page === page)
      .sort((a, b) => {
        const x = this.seed(a),
          y = this.seed(b);
        return x.page - y.page || x.y - y.y || x.x - y.x || a.localeCompare(b);
      });
  }
  dirty(id: string) {
    const seed = this.seed(id);
    if (!seed.sources.length) return true;
    const normalize = (delta: { insert: unknown; attributes?: Record<string, unknown> }[]) => {
      const result: { insert: string; attributes: PdfTextStyle }[] = [];
      for (const run of delta) {
        if (typeof run.insert !== 'string') return '';
        const attributes = { ...seed.style, ...run.attributes },
          previous = result.at(-1);
        if (previous && JSON.stringify(previous.attributes) === JSON.stringify(attributes))
          previous.insert += run.insert;
        else result.push({ insert: run.insert, attributes });
      }
      return JSON.stringify(result);
    };
    return normalize(this.text(id).toDelta()) !== normalize(seed.delta);
  }
  replace(id: string, start: number, end: number, value: string, style?: PdfTextStyle) {
    const text = this.text(id);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      end > text.length
    )
      throw new Error('Invalid PDF text range.');
    this.doc.transact(() => {
      if (end > start) text.delete(start, end - start);
      if (value) text.insert(start, value, style ?? this.styleAt(id, start));
    }, this.origin);
  }
  styleAt(id: string, offset: number): PdfTextStyle {
    let at = 0;
    for (const run of this.text(id).toDelta()) {
      if (typeof run.insert !== 'string') continue;
      at += run.insert.length;
      if (at >= Math.max(1, offset)) return { ...this.seed(id).style, ...run.attributes };
    }
    return this.seed(id).style;
  }
  format(id: string, start: number, end: number, patch: Partial<PdfTextStyle>) {
    if (start < 0 || end < start || end > this.text(id).length)
      throw new Error('Invalid PDF text range.');
    this.doc.transact(() => this.text(id).format(start, end - start, patch), this.origin);
  }
  anchor(id: string, offset: number) {
    return Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(this.text(id), offset));
  }
  resolve(anchor: ReturnType<PdfTextModel['anchor']>) {
    const value = Y.createAbsolutePositionFromRelativePosition(
      Y.createRelativePositionFromJSON(anchor),
      this.doc,
    );
    if (!value) return;
    const id = this.ids().find((id) => this.text(id) === value.type);
    return id ? { id, offset: value.index } : undefined;
  }
}
