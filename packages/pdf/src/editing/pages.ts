import * as Y from 'yjs';
import { sha256 } from '@noble/hashes/sha2.js';
import type { PdfPage } from '../document.ts';
import { PdfName, PdfReference } from '../objects.ts';

type Rotation = 0 | 90 | 180 | 270;
export type PdfManagedPage = { id: string; source: PdfPage; rotation: Rotation; blank: boolean };
const rank = (value: string) => {
  if (!/^-?\d+\/[1-9]\d*$/.test(value)) throw new Error('Invalid PDF page order.');
  const [n, d] = value.split('/');
  return [BigInt(n!), BigInt(d!)] as const;
};
const compare = (a: string, b: string) => {
  const [an, ad] = rank(a),
    [bn, bd] = rank(b),
    difference = an * bd - bn * ad;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};
function between(a?: string, b?: string) {
  if (!a && !b) return '0/1';
  if (!a) {
    const [n, d] = rank(b!);
    return `${n - d}/${d}`;
  }
  if (!b) {
    const [n, d] = rank(a);
    return `${n + d}/${d}`;
  }
  const [an, ad] = rank(a),
    [bn, bd] = rank(b);
  return `${an + bn}/${ad + bd}`;
}
// Independent inserts in the same gap receive distinct positions, so later inserts can still land between them.
function uniqueBetween(a?: string, b?: string) {
  const left = a ?? (b ? between(undefined, b) : '-1/1'),
    right = b ?? between(a, undefined);
  const [an, ad] = rank(left),
    [bn, bd] = rank(right),
    weight = BigInt(crypto.getRandomValues(new Uint32Array(1))[0]!) + 1n;
  return `${an + bn * weight}/${ad + bd * weight}`;
}
const rotation = (value: number): Rotation => {
  if (!Number.isSafeInteger(value) || value % 90)
    throw new Error('PDF rotation must use quarter turns.');
  return (((value % 360) + 360) % 360) as Rotation;
};

/** Page identity and editing ownership survive ordering changes. Each mutable property merges independently. */
export class PdfPageModel {
  readonly records: Y.Map<Y.Map<unknown>>;
  constructor(
    private doc: Y.Doc,
    private origin: object,
  ) {
    this.records = doc.getMap('pdf-pages');
  }
  dirty() {
    return [...this.records.values()].some((record) => record.size > 0);
  }
  private ensure(ids: readonly string[]) {
    for (const id of ids) {
      if (this.records.has(id)) continue;
      // Every peer creates the same shared type before its first mutation, so concurrent properties merge.
      const seed = new Y.Doc(),
        digest = sha256(new TextEncoder().encode(id));
      seed.clientID =
        digest.subarray(0, 6).reduce((value, byte) => value * 256 + byte, 0) + 0x100000000;
      seed.getMap<Y.Map<unknown>>('pdf-pages').set(id, new Y.Map());
      Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(seed), 'import');
      seed.destroy();
      if (!this.records.has(id))
        this.doc.transact(() => this.records.set(id, new Y.Map()), 'import');
    }
  }
  private record(id: string) {
    const value = this.records.get(id);
    if (!value) throw new Error('PDF page ownership is not initialized.');
    return value;
  }
  position(page: PdfPage) {
    return (this.records.get(page.id)?.get('order') as string | undefined) ?? `${page.index}/1`;
  }
  sourcePages(pages: readonly PdfPage[]): readonly PdfPage[] {
    this.ensure(pages.map((page) => page.id));
    return [
      ...pages,
      ...[...this.records]
        .filter(([id]) => /^blank:[\da-f-]{36}$/.test(id))
        .map(([id, record]) => {
          const width = record.get('width') as number,
            height = record.get('height') as number;
          return {
            id,
            index: record.get('index') as number,
            reference: new PdfReference(-1),
            dictionary: new Map([['Type', new PdfName('Page')]]),
            resources: new Map(),
            mediaBox: [0, 0, width, height] as const,
            cropBox: [0, 0, width, height] as const,
            rotation: 0 as const,
            userUnit: 1,
            width,
            height,
          };
        }),
    ];
  }
  items(pages: readonly PdfPage[]): PdfManagedPage[] {
    return this.sourcePages(pages)
      .filter((p) => !this.records.get(p.id)?.get('hidden'))
      .sort((a, b) => compare(this.position(a), this.position(b)) || a.id.localeCompare(b.id))
      .map((source) => ({
        id: source.id,
        source,
        rotation: rotation((this.records.get(source.id)?.get('rotation') as number) ?? 0),
        blank: source.index < 0,
      }));
  }
  insert(
    pages: readonly PdfPage[],
    afterId?: string,
    size?: { width: number; height: number },
    output?: readonly { id: string; source: PdfPage; continuation: number }[],
  ) {
    const items = output ?? this.items(pages).map((p) => ({ ...p, continuation: 0 })),
      index = afterId === undefined ? items.length - 1 : items.findIndex((p) => p.id === afterId);
    if (afterId !== undefined && index < 0) throw new Error('Unknown PDF page.');
    const neighbour = items[index]?.source ?? pages[0],
      width = size?.width ?? neighbour?.width ?? 612,
      height = size?.height ?? neighbour?.height ?? 792;
    if (![width, height].every((n) => Number.isFinite(n) && n > 0))
      throw new Error('Invalid PDF blank page size.');
    const id = `blank:${crypto.randomUUID()}`,
      indices = new Set(this.sourcePages(pages).map((p) => p.index));
    let logicalIndex: number;
    do {
      const data = crypto.getRandomValues(new Uint32Array(2));
      logicalIndex = -(data[0]! * 0x200000 + (data[1]! >>> 11) + 1);
    } while (!Number.isSafeInteger(logicalIndex) || indices.has(logicalIndex));
    this.ensure([id]);
    this.doc.transact(() => {
      const record = this.record(id);
      record.set('index', logicalIndex);
      record.set('width', width);
      record.set('height', height);
      record.set('hidden', true);
      record.set(
        'order',
        uniqueBetween(
          items[index] && this.outputPosition(items[index]!, pages),
          items[index + 1] && this.outputPosition(items[index + 1]!, pages),
        ),
      );
      record.set('anchor', record.get('order'));
    }, 'import');
    this.doc.transact(() => this.record(id).set('hidden', false), this.origin);
    return id;
  }
  private known(pages: readonly Pick<PdfPage, 'id'>[], id: string) {
    return pages.some(
      (p) =>
        p.id === id ||
        (id.startsWith(p.id + ':continuation:') &&
          /^[1-9]\d*$/.test(id.slice((p.id + ':continuation:').length))),
    );
  }
  remove(pages: readonly PdfPage[], ids: readonly string[], output?: readonly { id: string }[]) {
    const known = this.sourcePages(pages);
    if (ids.some((id) => !this.known(known, id))) throw new Error('Unknown PDF page.');
    // Create immutable blank ownership before the tracked visibility transaction so undo cannot erase it.
    this.ensure(ids);
    const replacement = (output ?? this.items(pages)).every((p) => ids.includes(p.id))
      ? this.insert(pages)
      : undefined;
    this.doc.transact(() => {
      for (const id of ids) this.record(id).set('hidden', true);
      if (replacement) this.record(replacement).set('hidden', false);
    }, this.origin);
  }
  move(
    pages: readonly PdfPage[],
    id: string,
    beforeId?: string,
    output?: readonly { id: string; source: PdfPage; continuation: number }[],
  ) {
    const all = output ?? this.items(pages).map((p) => ({ ...p, continuation: 0 }));
    if (
      !all.some((p) => p.id === id) ||
      (beforeId !== undefined && !all.some((p) => p.id === beforeId))
    )
      throw new Error('Unknown PDF page.');
    if (id === beforeId) return;
    this.ensure([id]);
    const items = all.filter((p) => p.id !== id),
      index = beforeId === undefined ? items.length : items.findIndex((p) => p.id === beforeId);
    this.doc.transact(
      () =>
        this.record(id).set(
          'order',
          uniqueBetween(
            items[index - 1] && this.outputPosition(items[index - 1]!, pages),
            items[index] && this.outputPosition(items[index]!, pages),
          ),
        ),
      this.origin,
    );
  }
  rotate(
    pages: readonly PdfPage[],
    ids: readonly string[],
    degrees: number,
    _output?: readonly { id: string }[],
  ) {
    rotation(degrees);
    const known = this.sourcePages(pages);
    if (ids.some((id) => !this.known(known, id))) throw new Error('Unknown PDF page.');
    this.ensure(ids);
    this.doc.transact(() => {
      for (const id of new Set(ids)) {
        const record = this.record(id);
        record.set('rotation', rotation(((record.get('rotation') as number) ?? 0) + degrees));
      }
    }, this.origin);
  }
  outputPosition(
    page: { id: string; source: PdfPage; continuation: number },
    pages: readonly PdfPage[],
  ) {
    const explicit = this.records.get(page.id)?.get('order');
    if (explicit !== undefined) return explicit as string;
    if (!page.continuation) return this.position(page.source);
    // Continuations have their own stable position. Moving the source page cannot move them implicitly.
    let left =
      page.source.index < 0
        ? ((this.records.get(page.source.id)?.get('anchor') as string) ??
          this.position(page.source))
        : `${page.source.index}/1`;
    const right = page.source.index < 0 ? between(left, undefined) : `${page.source.index + 1}/1`;
    for (let i = 0; i < page.continuation; i++) left = between(left, right);
    return left;
  }
  project<T extends { id: string; source: PdfPage; continuation: number; rotation: Rotation }>(
    flow: readonly T[],
    pages: readonly PdfPage[],
  ): T[] {
    return flow
      .filter((p) => !this.records.get(p.id)?.get('hidden'))
      .map((p) => ({
        ...p,
        rotation: rotation((this.records.get(p.id)?.get('rotation') as number) ?? 0),
      }))
      .sort(
        (a, b) =>
          compare(this.outputPosition(a, pages), this.outputPosition(b, pages)) ||
          a.id.localeCompare(b.id),
      );
  }
  validate(pages: readonly Pick<PdfPage, 'id' | 'index'>[]) {
    const originals = new Set(pages.map((p) => p.id)),
      indices = new Set(pages.map((p) => p.index));
    for (const [id, record] of this.records) {
      if (
        !(record instanceof Y.Map) ||
        (!originals.has(id) &&
          !/^blank:[\da-f-]{36}$/.test(id) &&
          !this.known(
            [
              ...pages,
              ...[...this.records.keys()]
                .filter((key) => /^blank:[\da-f-]{36}$/.test(key))
                .map((id) => ({ id })),
            ],
            id,
          ))
      )
        throw new Error('Invalid PDF page identity.');
      const blank = /^blank:[\da-f-]{36}$/.test(id);
      for (const key of record.keys())
        if (
          !(
            blank
              ? ['index', 'width', 'height', 'order', 'anchor', 'hidden', 'rotation']
              : ['order', 'hidden', 'rotation']
          ).includes(key)
        )
          throw new Error('Invalid PDF page property.');
      if (record.has('order')) rank(record.get('order') as string);
      if (record.has('anchor')) rank(record.get('anchor') as string);
      if (record.has('hidden') && typeof record.get('hidden') !== 'boolean')
        throw new Error('Invalid PDF page visibility.');
      if (record.has('rotation') && ![0, 90, 180, 270].includes(record.get('rotation') as number))
        throw new Error('Invalid PDF page rotation.');
      if (blank) {
        const index = record.get('index') as number;
        if (!Number.isSafeInteger(index) || index >= 0 || indices.has(index))
          throw new Error('Invalid PDF blank page index.');
        indices.add(index);
        for (const key of ['width', 'height'])
          if (
            !(
              typeof record.get(key) === 'number' &&
              Number.isFinite(record.get(key)) &&
              (record.get(key) as number) > 0
            )
          )
            throw new Error('Invalid PDF blank page size.');
        if (!record.has('order')) throw new Error('Blank PDF page has no position.');
      }
    }
  }
}
