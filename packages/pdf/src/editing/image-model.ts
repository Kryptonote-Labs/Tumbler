import * as Y from 'yjs';

export type PdfImagePlacement = {
  page: number;
  continuation: number;
  asset: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  hidden?: boolean;
};
/** Image bytes belong to the host's durable asset store, never to collaborative updates. */
export class PdfImageModel {
  readonly records: Y.Map<PdfImagePlacement>;
  constructor(private doc: Y.Doc, private origin: object) {
    this.records = doc.getMap('pdf-images');
  }
  get(id: string) { return this.records.get(id); }
  place(id: string, value: PdfImagePlacement) {
    if (!Number.isSafeInteger(value.page) || !Number.isSafeInteger(value.continuation) || value.continuation < 0 ||
      !value.asset || ![value.x, value.y, value.width, value.height].every(Number.isFinite) ||
      value.width <= 0 || value.height <= 0 || ![0, 90, 180, 270].includes(value.rotation))
      throw new Error('Invalid PDF image placement.');
    this.doc.transact(() => this.records.set(id, value), this.origin);
  }
  move(id: string, dx: number, dy: number) {
    const image = this.get(id);
    if (image) this.place(id, { ...image, x: image.x + dx, y: image.y + dy });
  }
  hide(id: string) { const image = this.get(id); if (image) this.place(id, { ...image, hidden: true }); }
  duplicate(id: string, copy: string) {
    const image = this.get(id);
    if (image) this.place(copy, { ...image, x: image.x + 12, y: image.y + 12, hidden: false });
  }
  rotate(id: string) {
    const image = this.get(id);
    if (image) this.place(id, { ...image, x: image.x + (image.width - image.height) / 2, y: image.y + (image.height - image.width) / 2, width: image.height, height: image.width, rotation: ((image.rotation + 90) % 360) as PdfImagePlacement['rotation'] });
  }
}
