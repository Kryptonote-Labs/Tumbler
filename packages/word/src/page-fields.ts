import type { WordBlock } from './document.ts';
import type { WordTextRun } from './create.ts';
import { runProperties } from './create-xml.ts';

/** Page fields occupy one object character in the editable text stream. */
export type WordPageField = 'PAGE' | 'NUMPAGES';
export const WORD_FIELD_CHARACTER = '\uFFFC';
export function isWordPageField(value: unknown): value is WordPageField {
  return value === 'PAGE' || value === 'NUMPAGES';
}
export function pageFieldInstruction(instruction: string): WordPageField | undefined {
  const match = /^\s*(PAGE|NUMPAGES)(?:\s+\\\*\s+(?:MERGEFORMAT|Arabic))*\s*$/i.exec(instruction);
  const field = match?.[1]?.toUpperCase();
  return isWordPageField(field) ? field : undefined;
}
/** Simple fields remain editable and recalculable in Word. */
export function pageFieldXml(run: WordTextRun): string {
  if (!isWordPageField(run.field) || run.text !== WORD_FIELD_CHARACTER || run.image)
    throw new TypeError('Page fields use one object replacement character.');
  return `<w:fldSimple w:instr="${run.field}" w:dirty="true"><w:r>${run.format ? `<w:rPr>${runProperties(run.format)}</w:rPr>` : ''}<w:t>1</w:t></w:r></w:fldSimple>`;
}
export function hasPageFields(blocks: readonly WordBlock[], kind?: WordPageField): boolean {
  return blocks.some(block => block.kind === 'table'
    ? block.rows.some(row => row.cells.some(cell => hasPageFields(cell.blocks, kind)))
    : block.kind === 'paragraph' && block.inlines.some(inline => {
      const runs = inline.kind === 'run' ? [inline] : inline.kind === 'hyperlink' || inline.kind === 'insertion' ? inline.runs : [];
      return runs.some(run => run.contents.some(content => content.kind === 'page-field' && (!kind || content.field === kind)));
    }));
}

export const WORD_PAGE_NUMBER_PRESETS = ['plain', 'page', 'x-of-y', 'bold-x-of-y', 'page-x-of-y'] as const;
export type WordPageNumberPreset = (typeof WORD_PAGE_NUMBER_PRESETS)[number];
/** Presets are ordinary formatted text around live fields, editable by humans or agents. */
export function wordPageNumberRuns(preset: WordPageNumberPreset): readonly WordTextRun[] {
  if (!WORD_PAGE_NUMBER_PRESETS.includes(preset)) throw new TypeError('Unknown page number preset.');
  const runs: WordTextRun[] = [];
  if (preset === 'page' || preset === 'page-x-of-y') runs.push({ text: 'Page ' });
  runs.push({ text: WORD_FIELD_CHARACTER, field: 'PAGE' });
  if (preset === 'x-of-y' || preset === 'bold-x-of-y' || preset === 'page-x-of-y')
    runs.push({ text: ' of ' }, { text: WORD_FIELD_CHARACTER, field: 'NUMPAGES' });
  return preset === 'bold-x-of-y' ? runs.map(run => ({ ...run, format: { bold: true } })) : runs;
}
