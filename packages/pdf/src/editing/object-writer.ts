import { PdfName, PdfReference, PdfString, type PdfValue, type PdfDictionary } from '../objects.ts';
import type { PdfDocument } from '../document.ts';
export const enc = new TextEncoder();
export const bytes = (s: string) => enc.encode(s);
export const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
export const n = (v: number) => {
  if (!Number.isFinite(v)) throw new Error('Non-finite PDF geometry.');
  return String(Math.round(v * 1e6) / 1e6);
};
export function serializePdfValue(value: PdfValue): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return n(value);
  if (typeof value === 'boolean') return String(value);
  if (value instanceof PdfName)
    return (
      '/' +
      [...enc.encode(value.value)]
        .map((c) =>
          c > 32 && c < 127 && !'()<>[]{}/%#'.includes(String.fromCharCode(c))
            ? String.fromCharCode(c)
            : '#' + c.toString(16).padStart(2, '0'),
        )
        .join('')
    );
  if (value instanceof PdfReference) return `${value.object} ${value.generation} R`;
  if (value instanceof PdfString) return `<${hex(value.bytes)}>`;
  if (Array.isArray(value)) return `[${value.map(serializePdfValue).join(' ')}]`;
  if (value instanceof Map)
    return `<<${[...value].map(([k, v]) => `${serializePdfValue(new PdfName(k))} ${serializePdfValue(v)}`).join('\n')}>>`;
  throw new Error('Streams must be indirect PDF objects.');
}
export class PdfWriter {
  private next: number;
  private objects = new Map<number, { reference: PdfReference; data: Uint8Array }>();
  constructor(private document: PdfDocument) {
    this.next = Number(document.source.trailer.get('Size'));
  }
  value(value: PdfValue, ref = new PdfReference(this.next++)) {
    this.objects.set(ref.object, { reference: ref, data: bytes(serializePdfValue(value)) });
    return ref;
  }
  stream(data: Uint8Array, info: PdfDictionary = new Map()) {
    const ref = new PdfReference(this.next++),
      dictionary = new Map(info);
    dictionary.delete('Filter');
    dictionary.delete('DecodeParms');
    dictionary.set('Length', data.length);
    const head = bytes(serializePdfValue(dictionary) + '\nstream\n'),
      tail = bytes('\nendstream');
    const output = new Uint8Array(head.length + data.length + tail.length);
    output.set(head);
    output.set(data, head.length);
    output.set(tail, head.length + data.length);
    this.objects.set(ref.object, { reference: ref, data: output });
    return ref;
  }
  finish() {
    const chunks: Uint8Array[] = [this.document.bytes(), bytes('\n')],
      offsets: { ref: PdfReference; offset: number }[] = [];
    let position = chunks.reduce((s, c) => s + c.length, 0);
    for (const { reference, data } of this.objects.values()) {
      offsets.push({ ref: reference, offset: position });
      const header = bytes(`${reference.object} ${reference.generation} obj\n`),
        tail = bytes('\nendobj\n');
      chunks.push(header, data, tail);
      position += header.length + data.length + tail.length;
    }
    const trailer = new Map(this.document.source.trailer);
    for (const key of ['Type', 'W', 'Index', 'Length', 'Filter', 'DecodeParms', 'XRefStm'])
      trailer.delete(key);
    trailer.set('Size', this.next);
    trailer.set('Prev', this.document.source.revisions[0]!);
    const xref = position;
    chunks.push(
      bytes(
        'xref\n' +
          offsets
            .sort((a, b) => a.ref.object - b.ref.object)
            .map(
              ({ ref, offset }) =>
                `${ref.object} 1\n${String(offset).padStart(10, '0')} ${String(ref.generation).padStart(5, '0')} n \n`,
            )
            .join('') +
          `trailer\n${serializePdfValue(trailer)}\nstartxref\n${xref}\n%%EOF\n`,
      ),
    );
    const result = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
    let at = 0;
    for (const chunk of chunks) {
      result.set(chunk, at);
      at += chunk.length;
    }
    return result;
  }
}
