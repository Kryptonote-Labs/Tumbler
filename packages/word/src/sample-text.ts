import type { WordBlock, WordDocument, WordParagraph } from './document.ts';
import { wordParagraphText, type WordTextSelection } from './text.ts';

// Original English filler, independent of Word's localized help text.
const english = [
  'A document begins with an idea and grows one sentence at a time.',
  'Clear words help readers follow the thought from beginning to end.',
  'Each paragraph gives the next part of the story room to unfold.',
  'Morning light falls across the desk beside an open notebook.',
  'Outside the window the city carries on with its familiar rhythm.',
  'There is time to pause and see the details that usually pass unnoticed.',
  'Good ideas often arrive while we are working on something else.',
  'Write them down and return to them when the moment is right.',
  'A small observation can become the start of something much larger.',
] as const;

const latin = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
] as const;

/** Expand =rand(p,s) or =lorem(p,s). Omitted counts default to three; invalid commands stay literal. */
export function wordSampleText(command: string, randSentences: readonly [string, ...string[]] = english): string | undefined {
  const match = /^[\t ]*=(rand|lorem)[\t ]*\([\t ]*(\d*)[\t ]*(?:,[\t ]*(\d*)[\t ]*)?\)[\t ]*$/i.exec(command);
  if (!match || match[0] !== command) return undefined;
  const paragraphs = Number(match[2] || 3);
  const sentences = Number(match[3] || 3);
  if (![paragraphs, sentences].every(count => Number.isSafeInteger(count) && count > 0)) return undefined;
  const source = match[1]!.toLowerCase() === 'rand' ? randSentences : latin;
  // Both sequences repeat. Build at most one corpus cycle, even for very large counts.
  const cycle = Array.from({ length: Math.min(paragraphs, source.length) }, (_, index) => {
    const start = (index * (sentences % source.length)) % source.length;
    const rotated = [...source.slice(start), ...source.slice(0, start)];
    return repeatItems(rotated, sentences, ' ');
  });
  return repeatItems(cycle, paragraphs, '\n');
}

export interface WordSampleTextEdit {
  readonly selection: WordTextSelection;
  readonly value: string;
}

/** Prepare one ordinary replacement when Enter follows a command occupying its entire paragraph. */
export function wordSampleTextEdit(document: WordDocument, selection: WordTextSelection): WordSampleTextEdit | undefined {
  const { anchor, focus } = selection;
  if (anchor.paragraphElementId !== focus.paragraphElementId || anchor.offset !== focus.offset) return undefined;
  const paragraph = findParagraph(document.blocks, anchor.paragraphElementId);
  if (!paragraph) return undefined;
  const command = wordParagraphText(document, paragraph);
  if (anchor.offset !== command.length) return undefined;
  const value = wordSampleText(command);
  if (value === undefined) return undefined;
  return {
    selection: {
      anchor: { paragraphElementId: paragraph.elementId, offset: 0 },
      focus: { paragraphElementId: paragraph.elementId, offset: command.length },
    },
    value: value + '\n',
  };
}

function repeatItems(items: readonly string[], count: number, separator: string): string {
  const cycle = items.join(separator) + separator;
  const complete = cycle.repeat(Math.floor(count / items.length));
  const remainder = items.slice(0, count % items.length).join(separator);
  return remainder ? complete + remainder : complete.slice(0, -separator.length);
}

function findParagraph(blocks: readonly WordBlock[], id: number): WordParagraph | undefined {
  for (const block of blocks) {
    if (block.kind === 'paragraph' && block.elementId === id) return block;
    if (block.kind === 'table') {
      for (const row of block.rows) for (const cell of row.cells) {
        const paragraph = findParagraph(cell.blocks, id);
        if (paragraph) return paragraph;
      }
    }
  }
  return undefined;
}
