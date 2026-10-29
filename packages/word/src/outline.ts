import type { NativeWordDocument } from './native-document.ts';
import type { WordBlock } from './document.ts';
import { wordParagraphText } from './text.ts';

/** Body heading positions, excluding table contents as in Word's navigation pane. */
export function wordHeadingOutline(document: Pick<NativeWordDocument, 'blocks' | 'paragraphFormat'>) {
  const headings: { start: number; end: number; level: number; text: string }[] = [];
  let offset = 0;
  function visit(blocks: readonly WordBlock[], inTable = false) {
    for (const block of blocks) {
      if (block.kind === 'table') {
        for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks, true);
      } else if (block.kind === 'paragraph') {
        const text = wordParagraphText(undefined, block);
        const level = document.paragraphFormat(block).outlineLevel;
        const title = text.replace(/\s+/g, ' ').trim();
        if (!inTable && level !== undefined && level < 9 && title)
          headings.push({ start: offset, end: offset + text.length, level: level + 1, text: title });
        offset += text.length + 1;
      }
    }
  }
  visit(document.blocks);
  return headings;
}
