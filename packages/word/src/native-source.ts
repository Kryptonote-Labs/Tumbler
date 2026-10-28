import { wordDocumentDefaults } from './document-defaults.ts';
import { resolveWordTableGrid } from './table-grid.ts';
import type { WordArtifact } from './artifact.ts';
import type { WordBlock, WordParagraph, WordRun, WordRunContent, WordInline, WordTable, WordTableRow, WordTableCell } from './document.ts';
import { importWordContent } from './import-content.ts';
import type { WordTextParagraph } from './create.ts';
import type { WordContentBlock } from './create-content.ts';
import type { ComputedWordParagraphFormat, ComputedWordTextFormat } from './styles.ts';
import type { WordParagraphNumbering } from './numbering.ts';
import { rememberImportedWordContent } from './import-content-cache.ts';

function formatInterner<T extends object>() {
  const values = new Map<string, T>();
  return (value: T): T => {
    const key = JSON.stringify(Object.entries(value));
    const previous = values.get(key);
    if (previous) return previous;
    values.set(key, value);
    return value;
  };
}

const compiledSources = new WeakMap<WordArtifact, NativeWordSource>();

/** Source properties are immutable and shared by all models of the same native revision. */
export function nativeWordSource(artifact: WordArtifact) {
  let source = compiledSources.get(artifact);
  if (!source) {
    source = new NativeWordSource(artifact);
    compiledSources.set(artifact, source);
  }
  return source;
}

/** Compiled once at import. Editing resolves semantic properties by identity, never by XML. */
export class NativeWordSource {
  readonly paragraphs = new Map<number, {
    block: WordParagraph;
    format: ComputedWordParagraphFormat;
    textFormat: ComputedWordTextFormat;
    numbering: WordParagraphNumbering | undefined;
    directNumbering: Partial<WordParagraphNumbering>;
    positioning: WordTextParagraph['positioning'];
  }>();
  readonly leaves = new Map<number, {
    run: WordRun;
    content: WordRunContent;
    owner: WordInline;
    characterStyleId: string | undefined;
    format: ComputedWordTextFormat;
  }>();
  readonly tables = new Map<number, WordTable>();
  readonly tableWidths = new Map<number, readonly number[]>();
  readonly rows = new Map<number, WordTableRow>();
  readonly cells = new Map<number, WordTableCell>();
  readonly lists = new Map<number, WordTextParagraph['list']>();
  readonly original: ReturnType<typeof importWordContent>;
  readonly defaults: ReturnType<typeof wordDocumentDefaults>;

  snapshot() {
    // Resolved formats are immutable values. Word often repeats the same declaration
    // on thousands of distinct runs; native storage needs only one copy of each value.
    const textFormat = formatInterner<ComputedWordTextFormat>();
    const paragraphFormat = formatInterner<ComputedWordParagraphFormat>();
    const authoredText = formatInterner<NonNullable<WordTextParagraph['runs'][number]['format']>>();
    const authoredParagraph = formatInterner<NonNullable<WordTextParagraph['paragraph']>>();
    const content = (blocks: readonly WordContentBlock[]): WordContentBlock[] => blocks.map(block =>
      block.kind === 'table' ? { ...block, rows: block.rows.map(row => row.map(cell => ({ ...cell, blocks: content(cell.blocks) }))) }
        : block.kind === 'paragraph' ? { ...block, ...(block.paragraph ? { paragraph: authoredParagraph(block.paragraph) } : {}),
            runs: block.runs.map(run => ({ ...run, ...(run.format ? { format: authoredText(run.format) } : {}) })) } : block);
    return { artifact: this.artifact, defaults: this.defaults, original: content(this.original),
      paragraphs: [...this.paragraphs].map(([id, value]) => [id, { ...value, format: paragraphFormat(value.format), textFormat: textFormat(value.textFormat) }] as const),
      leaves: [...this.leaves].map(([id, value]) => [id, { ...value, format: textFormat(value.format) }] as const), tables: [...this.tables],
      tableWidths: [...this.tableWidths], rows: [...this.rows], cells: [...this.cells], lists: [...this.lists] };
  }

  constructor(readonly artifact: WordArtifact, snapshot?: NativeWordSourceSnapshot) {
    if (snapshot) {
      this.defaults = snapshot.defaults;
      this.original = snapshot.original;
      rememberImportedWordContent(artifact, this.original);
      for (const [id, value] of snapshot.paragraphs) this.paragraphs.set(id, value);
      for (const [id, value] of snapshot.leaves) this.leaves.set(id, value);
      for (const [id, value] of snapshot.tables) this.tables.set(id, value);
      for (const [id, value] of snapshot.tableWidths) this.tableWidths.set(id, value);
      for (const [id, value] of snapshot.rows) this.rows.set(id, value);
      for (const [id, value] of snapshot.cells) this.cells.set(id, value);
      for (const [id, value] of snapshot.lists) this.lists.set(id, value);
      compiledSources.set(artifact, this);
      return;
    }
    const document = artifact.document;
    this.defaults = wordDocumentDefaults(document);
    this.original = importWordContent(artifact);
    const visit = (blocks: readonly WordBlock[]) => {
      for (const block of blocks) {
        if (block.kind === 'table') {
          this.tables.set(block.elementId, block);
          this.tableWidths.set(block.elementId, resolveWordTableGrid(block).columnWidthsTwips.map(width => width / 20));
          for (const row of block.rows) {
            this.rows.set(row.elementId, row);
            for (const cell of row.cells) {
              this.cells.set(cell.elementId, cell);
              visit(cell.blocks);
            }
          }
        } else if (block.kind === 'paragraph') {
          this.paragraphs.set(block.elementId, {
            block,
            format: document.styles.paragraphFormat(document, block),
            textFormat: document.styles.runFormat(document, block),
            numbering: document.numbering.paragraphReference(document, block),
            directNumbering: document.numbering.paragraphProperties(document, block),
            positioning: document.styles.paragraphPositioning(document, block),
          });
          for (const owner of block.inlines) {
            const runs = owner.kind === 'run' ? [owner] : owner.kind === 'hyperlink' || owner.kind === 'insertion' ? owner.runs : [];
            for (const run of runs) {
              const format = document.styles.runFormat(document, block, run);
              const characterStyleId = document.styles.runCharacterStyle(document, run);
              for (const content of run.contents)
                this.leaves.set(content.elementId, { run, content, owner, format, characterStyleId });
            }
          }
        }
      }
    };
    visit(document.blocks);
    const lists = (blocks: typeof this.original) => {
      for (const block of blocks) {
        if (block.kind === 'paragraph' && block.source !== undefined) this.lists.set(block.source, block.list);
        else if (block.kind === 'table') for (const row of block.rows) for (const cell of row) lists([...cell.blocks]);
      }
    };
    lists(this.original);
  }
}

export type NativeWordSourceSnapshot = ReturnType<NativeWordSource['snapshot']>;

/** Opaque blocks keep their source reading order while supported neighbours are edited or removed. */
export function retainOpaqueBlocks(input: readonly { source?: number }[], output: WordBlock[], original: readonly WordBlock[]): WordBlock[] {
  if (!original.some(block => block.kind === 'unsupported')) return output;
  const result: WordBlock[] = [];
  let cursor = 0;
  const positions = new Map(original.map((block, index) => [block.elementId, index]));
  for (const [index, block] of output.entries()) {
    const at = positions.get(input[index]?.source!);
    if (at !== undefined && at >= cursor) {
      for (; cursor < at; cursor++) if (original[cursor]!.kind === 'unsupported') result.push(original[cursor]!);
      cursor = at + 1;
    }
    result.push(block);
  }
  for (; cursor < original.length; cursor++) if (original[cursor]!.kind === 'unsupported') result.push(original[cursor]!);
  return result;
}
