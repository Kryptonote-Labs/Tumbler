import { decodePdfStream } from './filters.ts';
import { array, bytesText, dictionary, integer, invalid, name, PdfError, PdfReference, PdfStream, PdfString, type PdfDictionary, type PdfValue } from './objects.ts';
import { PdfSyntax } from './syntax.ts';
import { PdfSecurity } from './security.ts';

type XrefEntry = { kind: 'free'; generation: number } | { kind: 'offset'; offset: number; generation: number } | { kind: 'compressed'; stream: number; index: number };
interface Section { trailer: PdfDictionary; entries: Map<number, XrefEntry> }

/** Source-preserving object graph. No repair scan or rendering projection can replace authoritative xrefs. */
export class PdfSource {
  readonly version: string;
  readonly trailer: PdfDictionary;
  private readonly original: Uint8Array;
  private readonly xref = new Map<number, XrefEntry>();
  private readonly objects = new Map<string, PdfValue>();
  private security: PdfSecurity | undefined;
  private readonly decoding = new Set<string>();
  private readonly decoded = new WeakMap<PdfStream, Uint8Array>();
  private readonly objectStreams = new Map<number, { ids: number[]; offsets: number[]; first: number; bytes: Uint8Array }>();
  readonly revisions: readonly number[];

  constructor(input: Uint8Array) {
    this.original = Uint8Array.from(input);
    const header = /^%PDF-(\d\.\d)(?:\r|\n)/.exec(bytesText(this.original.subarray(0, 16)));
    if (!header) invalid('File does not begin with a PDF header.');
    this.version = header[1]!;
    const tail = bytesText(this.original.subarray(Math.max(0, this.original.length - 65536)));
    const match = /startxref\s+(\d+)\s+%%EOF[\x00\t\n\f\r ]*$/.exec(tail);
    if (!match) invalid('PDF has no final startxref and EOF marker.');
    let offset: number | undefined = Number(match[1]);
    const visited = new Set<number>(), revisions: number[] = [];
    let latest: PdfDictionary | undefined;
    while (offset !== undefined) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= this.original.length || visited.has(offset)) invalid('Invalid or cyclic PDF cross-reference chain.', offset);
      visited.add(offset); revisions.push(offset);
      const section = this.section(offset);
      latest ??= section.trailer;
      const supplemental = section.trailer.get('XRefStm');
      if (supplemental !== undefined) {
        const hybridOffset = integer(supplemental);
        if (visited.has(hybridOffset)) invalid('Cyclic hybrid cross-reference stream.');
        visited.add(hybridOffset);
        for (const [id, entry] of this.section(hybridOffset).entries) section.entries.set(id, entry);
      }
      for (const [id, entry] of section.entries) if (!this.xref.has(id)) this.xref.set(id, entry);
      const previous = section.trailer.get('Prev');
      offset = previous === undefined ? undefined : integer(previous);
    }
    this.trailer = latest!;
    this.revisions = revisions;
    const size = integer(this.trailer.get('Size'));
    if (size < 1 || [...this.xref.keys()].some(id => id >= size)) invalid('Cross-reference object exceeds trailer /Size.');
  }

  bytes() { return this.original.slice(); }
  get catalog() { return dictionary(this.resolve(this.trailer.get('Root')), 'catalog'); }
  get encrypted() { return this.trailer.has('Encrypt'); }
  authenticate(password?: string) {
    if (!this.encrypted) return;
    this.security = PdfSecurity.open(this, password);
    this.objects.clear();
  }

  resolve(value: PdfValue | undefined): PdfValue {
    let current = value ?? null;
    const seen = new Set<string>();
    while (current instanceof PdfReference) {
      if (seen.has(current.key)) return invalid('Cyclic chain of PDF indirect references.');
      seen.add(current.key);
      current = this.object(current);
    }
    return current;
  }
  object(reference: PdfReference): PdfValue {
    const cached = this.objects.get(reference.key);
    if (cached !== undefined) return cached;
    const entry = this.xref.get(reference.object);
    if (!entry || entry.kind === 'free') return null;
    if (reference.generation !== (entry.kind === 'compressed' ? 0 : entry.generation)) return null;
    if (this.decoding.has(reference.key)) return invalid('Cyclic PDF object decoding.', reference.object);
    this.decoding.add(reference.key);
    try {
      let value: PdfValue;
      if (entry.kind === 'offset') {
        value = this.indirect(entry.offset, reference).value;
        const encryption = this.trailer.get('Encrypt');
        if (this.security && (!(encryption instanceof PdfReference) || encryption.key !== reference.key)) value = this.decryptValues(value, reference);
      }
      else {
        const stream = this.objectStream(entry.stream);
        if (stream.ids[entry.index] !== reference.object) return invalid('Compressed object does not match its cross-reference index.');
        const start = stream.first + stream.offsets[entry.index]!;
        const end = stream.first + (stream.offsets[entry.index + 1] ?? stream.bytes.length - stream.first);
        if (start < stream.first || end > stream.bytes.length || end < start) return invalid('Invalid object-stream offset.');
        const syntax = new PdfSyntax(stream.bytes.subarray(start, end));
        value = syntax.value(); syntax.skip();
        if (syntax.position !== syntax.bytes.length) return invalid('Unexpected data after compressed PDF object.');
      }
      this.objects.set(reference.key, value);
      return value;
    } finally { this.decoding.delete(reference.key); }
  }
  stream(value: PdfValue | undefined): Uint8Array {
    const stream = this.resolve(value);
    if (!(stream instanceof PdfStream)) return invalid('Expected a PDF stream.');
    let decoded = this.decoded.get(stream);
    if (!decoded) { decoded = decodePdfStream(this.encodedStream(stream), stream.dictionary, value => this.resolve(value)); this.decoded.set(stream, decoded); }
    return decoded;
  }
  encodedStream(stream: PdfStream) {
    if (!this.encrypted || name(stream.dictionary.get('Type')) === 'XRef') return stream.encoded;
    if (!this.security) throw new PdfError('password_required', 'Authenticate this PDF before decoding its content.');
    if (name(stream.dictionary.get('Type')) === 'Metadata' && this.security.dictionary.get('EncryptMetadata') === false) return stream.encoded;
    return this.security.decrypt(stream.encoded, stream.object, true);
  }
  private decryptValues(value: PdfValue, reference: PdfReference): PdfValue {
    if (value instanceof PdfString) return new PdfString(this.security!.decrypt(value.bytes, reference, false));
    if (Array.isArray(value)) return value.map(item => this.decryptValues(item, reference));
    if (value instanceof Map) return new Map([...value].map(([key, item]) => [key, this.decryptValues(item, reference)]));
    if (value instanceof PdfStream) {
      if (name(value.dictionary.get('Type')) === 'XRef') return value;
      return new PdfStream(dictionary(this.decryptValues(value.dictionary, reference)), value.encoded, reference);
    }
    return value;
  }
  private indirect(offset: number, expected?: PdfReference): { reference: PdfReference; value: PdfValue } {
    const syntax = new PdfSyntax(this.original, offset);
    const reference = new PdfReference(integer(Number(syntax.word())), integer(Number(syntax.word())));
    if (reference.object < 1 || reference.generation < 0 || reference.generation > 65535) return invalid('Invalid PDF indirect object identifier.', offset);
    if (expected && expected.key !== reference.key) return invalid('PDF object does not match its cross-reference entry.', offset);
    syntax.expect('obj');
    let value = syntax.value();
    if (value instanceof Map && syntax.peek('stream')) {
      syntax.expect('stream');
      if (this.original[syntax.position] === 13) syntax.position++;
      if (this.original[syntax.position] === 10) syntax.position++;
      else if (this.original[syntax.position - 1] !== 13) return invalid('PDF stream keyword must be followed by an end-of-line.', syntax.position);
      const rawLength = value.get('Length');
      const length = integer(rawLength instanceof PdfReference ? this.resolve(rawLength) : rawLength);
      const end = syntax.position + length;
      if (length < 0 || end > this.original.length) return invalid('PDF stream length is outside the source.', syntax.position);
      value = new PdfStream(value, this.original.subarray(syntax.position, end), reference);
      syntax.position = end;
      syntax.expect('endstream');
    }
    syntax.expect('endobj');
    return { reference, value };
  }
  private section(offset: number): Section {
    const syntax = new PdfSyntax(this.original, offset);
    const entries = new Map<number, XrefEntry>();
    if (syntax.peek('xref')) {
      syntax.expect('xref');
      while (!syntax.peek('trailer')) {
        const first = integer(Number(syntax.word())), count = integer(Number(syntax.word()));
        if (first < 0 || count < 0 || count > this.original.length / 4) return invalid('Invalid xref subsection size.');
        for (let i = 0; i < count; i++) {
          const position = integer(Number(syntax.word())), generation = integer(Number(syntax.word())), kind = syntax.word();
          if (entries.has(first + i) || position < 0 || generation < 0 || generation > 65535 || !['n', 'f'].includes(kind)) return invalid('Invalid or duplicate cross-reference entry.');
          entries.set(first + i, kind === 'n' ? { kind: 'offset', offset: position, generation } : { kind: 'free', generation });
        }
      }
      syntax.expect('trailer');
      return { entries, trailer: dictionary(syntax.value(), 'trailer') };
    }
    const { value } = this.indirect(offset);
    if (!(value instanceof PdfStream) || name(value.dictionary.get('Type')) !== 'XRef') return invalid('startxref does not point to a cross-reference section.', offset);
    const info = value.dictionary, widths = array(info.get('W')).map(value => integer(value));
    if (widths.length !== 3 || widths.some(width => width < 0 || width > 8)) return invalid('Invalid cross-reference stream /W.');
    const ranges = info.has('Index') ? array(info.get('Index')).map(value => integer(value)) : [0, integer(info.get('Size'))];
    if (ranges.length % 2 || ranges.some(value => value < 0)) return invalid('Invalid cross-reference stream /Index.');
    const bytes = decodePdfStream(value.encoded, info);
    let at = 0;
    const field = (width: number, fallback = 0) => {
      if (!width) return fallback;
      let value = 0;
      for (let i = 0; i < width; i++) { if (at >= bytes.length) return invalid('Truncated cross-reference stream.'); value = value * 256 + bytes[at++]!; }
      return integer(value);
    };
    for (let i = 0; i < ranges.length; i += 2) {
      const first = ranges[i]!, count = ranges[i + 1]!;
      if (count > bytes.length + 1) return invalid('Cross-reference stream count exceeds its payload.');
      for (let j = 0; j < count; j++) {
        const kind = field(widths[0]!, 1), a = field(widths[1]!), b = field(widths[2]!);
        const id = first + j;
        if (entries.has(id)) return invalid('Duplicate cross-reference stream entry.');
        if (kind === 0) entries.set(id, { kind: 'free', generation: b });
        else if (kind === 1) entries.set(id, { kind: 'offset', offset: a, generation: b });
        else if (kind === 2) entries.set(id, { kind: 'compressed', stream: a, index: b });
        // Unknown entry types are null objects under ISO 32000-1 7.5.8.3.
        else entries.set(id, { kind: 'free', generation: 0 });
      }
    }
    return { trailer: info, entries };
  }
  private objectStream(id: number) {
    const cached = this.objectStreams.get(id);
    if (cached) return cached;
    const stream = this.object(new PdfReference(id));
    if (!(stream instanceof PdfStream) || name(stream.dictionary.get('Type')) !== 'ObjStm') return invalid('Compressed object points to a non-object stream.');
    const count = integer(stream.dictionary.get('N')), first = integer(stream.dictionary.get('First'));
    const bytes = this.stream(stream), syntax = new PdfSyntax(bytes);
    if (count < 0 || first < 0 || first > bytes.length || count > bytes.length / 2) return invalid('Invalid object-stream header.');
    const ids: number[] = [], offsets: number[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(integer(Number(syntax.word()))); offsets.push(integer(Number(syntax.word())));
      if (ids[i]! < 1 || offsets[i]! < 0 || (i && offsets[i]! < offsets[i - 1]!)) return invalid('Invalid object-stream object index.');
    }
    if (new Set(ids).size !== ids.length || syntax.position > first) return invalid('Object-stream header overlaps content.');
    const result = { ids, offsets, first, bytes };
    this.objectStreams.set(id, result);
    return result;
  }
}
