import { resolveWordTableGrid } from './table-grid.ts';
import type { WordArtifact } from './artifact.ts';
import type { WordBlock, WordParagraph, WordRun, WordRunContent, WordInline, WordTable, WordTableRow, WordTableCell } from './document.ts';
import { importWordContent } from './import-content.ts';
import type { WordTextParagraph } from './create.ts';
import type { ComputedWordParagraphFormat, ComputedWordTextFormat } from './styles.ts';
import type { WordParagraphNumbering } from './numbering.ts';

/** Compiled once at import. Editing resolves semantic properties by identity, never by XML. */
export class NativeWordSource {
  readonly paragraphs = new Map<number, {
    block: WordParagraph;
    format: ComputedWordParagraphFormat;
    textFormat: ComputedWordTextFormat;
    numbering: WordParagraphNumbering | undefined;
  }>();
  readonly leaves = new Map<number, {
    run: WordRun;
    content: WordRunContent;
    owner: WordInline;
    format: ComputedWordTextFormat;
  }>();
  readonly tables = new Map<number, WordTable>();
  readonly tableWidths = new Map<number, readonly number[]>();
  readonly rows = new Map<number, WordTableRow>();
  readonly cells = new Map<number, WordTableCell>();
  readonly lists = new Map<number, WordTextParagraph['list']>();
  readonly original;

  constructor(readonly artifact: WordArtifact) {
    const document = artifact.document;
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
          });
          for (const owner of block.inlines) {
            const runs = owner.kind === 'run' ? [owner] : owner.kind === 'hyperlink' || owner.kind === 'insertion' ? owner.runs : [];
            for (const run of runs) {
              const format = document.styles.runFormat(document, block, run);
              for (const content of run.contents)
                this.leaves.set(content.elementId, { run, content, owner, format });
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
