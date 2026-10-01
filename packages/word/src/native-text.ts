import { createWordArtifact, type CreateWordOptions } from './create.ts';
import type { WordParagraph, WordRunContent } from './document.ts';
import { layoutWordResolvedParagraph, type WordLayoutLine, type WordTextMeasurer } from './layout.ts';
import { DEFAULT_TEXT, DEFAULT_PARAGRAPH, type ComputedWordTextFormat } from './styles.ts';

export interface NativeWordParagraph { readonly id: number; readonly text: string; }
/** Positions use UTF-16 offsets. Edits in a transaction are applied sequentially. */
export interface NativeWordTextEdit { readonly start: number; readonly deleteCount: number; readonly insert: string; }

/** Plain-text native editing slice. Unchanged paragraph objects and identities survive transactions.
 * This model deliberately does not import rich DOCX; export is the only packaging boundary.
 */
export class NativeWordText {
  private nextId = 0;
  private blocks: readonly NativeWordParagraph[];
  private size: number;
  revision = 0;

  constructor(text = '') {
    validate(text);
    this.blocks = text.split('\n').map((text) => Object.freeze({ id: this.nextId++, text }));
    this.size = text.length;
  }
  get paragraphs() { return this.blocks; }
  get length() { return this.size; }
  get text() { return this.blocks.map((block) => block.text).join('\n'); }

  transact(edits: readonly NativeWordTextEdit[]) {
    let blocks = this.blocks;
    let size = this.size;
    let nextId = this.nextId;
    for (const edit of edits) {
      validate(edit.insert);
      if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.deleteCount) || edit.start < 0 || edit.deleteCount < 0 || edit.start + edit.deleteCount > size)
        throw new RangeError('Edit is outside the document.');
      if (!edit.deleteCount && !edit.insert) continue;
      const locate = (offset: number) => {
        let start = 0;
        for (let index = 0; index < blocks.length; index++) {
          const block = blocks[index]!;
          if (offset <= start + block.text.length) return { index, offset: offset - start };
          start += block.text.length + 1;
        }
        throw new RangeError('Missing paragraph.');
      };
      const start = locate(edit.start);
      const end = locate(edit.start + edit.deleteCount);
      const first = blocks[start.index]!;
      const value = first.text.slice(0, start.offset) + edit.insert + blocks[end.index]!.text.slice(end.offset);
      validate(value);
      const inserted = value.split('\n').map((text, index) => Object.freeze({ id: index === 0 ? first.id : nextId++, text }));
      blocks = [...blocks.slice(0, start.index), ...inserted, ...blocks.slice(end.index + 1)];
      size += edit.insert.length - edit.deleteCount;
    }
    if (blocks === this.blocks) return;
    this.blocks = blocks;
    this.size = size;
    this.nextId = nextId;
    this.revision++;
  }

  docx(options: Omit<CreateWordOptions, 'blocks' | 'paragraphs'> = {}) {
    return createWordArtifact({ ...options, paragraphs: this.blocks.map((block) => ({ runs: [{ text: block.text }] })) }).bytes();
  }
}

function validate(text: string) {
  if (!text.isWellFormed() || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(text)) throw new TypeError('Invalid document text.');
}

/** Reuse Tumbler's line breaking and geometry; only changed paragraphs are measured again. */
export class NativeWordTextLayout {
  private readonly cache = new WeakMap<NativeWordParagraph, readonly WordLayoutLine[]>();
  measuredParagraphs = 0;
  constructor(
    private readonly measurer: WordTextMeasurer,
    readonly width: number,
    private readonly textFormat: ComputedWordTextFormat = DEFAULT_TEXT,
  ) {}
  paragraph(block: NativeWordParagraph) {
    const previous = this.cache.get(block);
    if (previous) return previous;
    const contents: WordRunContent[] = [];
    for (const [index, text] of block.text.split('\t').entries()) {
      if (index) contents.push({ kind: 'tab', elementId: index * 2 });
      contents.push({ kind: 'text', elementId: index * 2 + 1, value: text, preserveSpace: true });
    }
    const paragraph: WordParagraph = { kind: 'paragraph', elementId: block.id, propertiesElementId: undefined, section: undefined,
      inlines: [{ kind: 'run', elementId: block.id, propertiesElementId: undefined, contents }] };
    const lines = layoutWordResolvedParagraph(paragraph, this.width, this.measurer, this.textFormat, {
      ...DEFAULT_PARAGRAPH, lineSpacing: { rule: 'auto', value: 360 },
    });
    this.cache.set(block, lines);
    this.measuredParagraphs++;
    return lines;
  }
}
