import { pdfSourceAttribute, pdfStyleAttributes } from './source-spacing.ts';
import * as Y from 'yjs';
import { pdfTextStylePatch, type PdfTextStyle } from './fonts.ts';
import type { PdfTextSeed } from './import-text.ts';
export { importPdfText, pdfSourceKey, type PdfTextSeed } from './import-text.ts';

export type PdfTextPlacement = {
  x: number;
  y: number;
  width?: number;
  hidden?: boolean;
  continuation?: number;
};

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
        const text = new Y.Text();
        region.set('text', text);
        const original = new Set(seed.spacing?.flatMap((gap) => [gap.left, gap.right]));
        text.applyDelta(
          seed.delta.map((run, index) => ({
            ...run,
            attributes: original.has(index)
              ? { ...run.attributes, [pdfSourceAttribute]: index }
              : run.attributes,
          })),
        );
        region.set('seed', seed);
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
  placement(id: string): PdfTextPlacement | undefined {
    return this.regions.get(id)?.get('placement') as PdfTextPlacement | undefined;
  }
  geometry(id: string) {
    return { ...this.seed(id), ...this.placement(id) };
  }
  /** Placement is independent of source ownership and collaborative text. One gesture is one undo step. */
  place(id: string, patch: Partial<PdfTextPlacement>) {
    const seed = this.seed(id),
      previous = this.placement(id);
    const value = { x: seed.x, y: seed.y, ...previous, ...patch };
    if (
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      (value.width !== undefined && (!Number.isFinite(value.width) || value.width <= 0)) ||
      (value.continuation !== undefined &&
        (!Number.isSafeInteger(value.continuation) || value.continuation < 0))
    )
      throw new Error('Invalid PDF text placement.');
    this.doc.transact(() => this.regions.get(id)!.set('placement', value), this.origin);
  }
  /** Supply the flow region's origin when detaching text already displaced by paragraph flow. */
  move(
    id: string,
    dx: number,
    dy: number,
    origin?: Pick<PdfTextPlacement, 'x' | 'y' | 'continuation'>,
  ) {
    const frame = origin ?? this.geometry(id);
    this.place(id, {
      x: frame.x + dx,
      y: frame.y + dy,
      ...(origin?.continuation === undefined ? {} : { continuation: origin.continuation }),
    });
  }
  duplicate(id: string, nextId: string, dx = 12, dy = 12) {
    const seed = this.geometry(id);
    this.add({
      id: nextId,
      page: seed.page,
      ...(seed.continuation === undefined ? {} : { continuation: seed.continuation }),
      x: seed.x + dx,
      y: seed.y + dy,
      width: seed.width,
      lineHeight: seed.lineHeight,
      style: seed.style,
      sources: [],
      delta: [],
    });
    this.doc.transact(() => {
      const delta: { insert: unknown; attributes?: Record<string, unknown> }[] =
        this.text(id).toDelta();
      this.text(nextId).applyDelta(
        delta.map((run) => ({
          insert: run.insert,
          attributes: pdfStyleAttributes(run.attributes),
        })),
      );
    }, this.origin);
    return nextId;
  }
  hide(id: string, hidden = true) {
    this.place(id, { hidden });
  }
  /** A pure translation can retain the original PDF operators, fonts and glyph transforms. */
  sourcePreserved(id: string) {
    const p = this.placement(id);
    return (
      this.seed(id).sources.length > 0 &&
      !this.contentDirty(id) &&
      !p?.hidden &&
      !(p?.continuation && p.continuation > 0) &&
      (p?.width === undefined || p.width === this.seed(id).width)
    );
  }
  dirty(id: string) {
    return this.placement(id) !== undefined || this.contentDirty(id);
  }
  contentDirty(id: string) {
    const seed = this.seed(id);
    if (!seed.sources.length) return true;
    const normalize = (delta: { insert: unknown; attributes?: Record<string, unknown> }[]) => {
      const result: { insert: string; attributes: PdfTextStyle }[] = [];
      for (const run of delta) {
        if (typeof run.insert !== 'string') return '';
        const attributes = { ...seed.style, ...pdfStyleAttributes(run.attributes) },
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
    const attributes = style ?? this.styleAt(id, start + (end > start ? 1 : 0));
    this.doc.transact(() => {
      if (end > start) text.delete(start, end - start);
      if (value)
        text.insert(start, value, {
          ...attributes,
          [pdfSourceAttribute]: null,
        });
    }, this.origin);
  }
  styleAt(id: string, offset: number): PdfTextStyle {
    let at = 0;
    for (const run of this.text(id).toDelta()) {
      if (typeof run.insert !== 'string') continue;
      at += run.insert.length;
      if (at >= Math.max(1, offset))
        return { ...this.seed(id).style, ...pdfStyleAttributes(run.attributes) };
    }
    return this.seed(id).style;
  }
  format(id: string, start: number, end: number, patch: Partial<PdfTextStyle>) {
    if (start < 0 || end < start || end > this.text(id).length)
      throw new Error('Invalid PDF text range.');
    const attributes = pdfTextStylePatch(this.styleAt(id, start), patch);
    this.doc.transact(() => this.text(id).format(start, end - start, attributes), this.origin);
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
