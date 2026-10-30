import type * as Y from 'yjs';
import { createWordCommands, type WordFormatPatch, type WordRange } from '../collaboration/commands.ts';
import type { TextAttributes } from '../collaboration/formatting.ts';
import { positionedWordEdit } from '../collaboration/page-number.ts';
import { wordAuthoringStyles } from '../authored-styles.ts';
import type { WordStyles } from '../styles.ts';
import { createWordOperations } from './execute.ts';
import { characterFormat } from './schemas.ts';

const continuedCharacterKeys = characterFormat.omit({ link: true }).keyof().options;

/** Finish a paragraph using its next style, or retain its character formatting when the style continues. */
export function createWordParagraphBreak(commands = createWordCommands()) {
  const prepareOperation = createWordOperations(commands);
  return function prepareWordParagraphBreak(
    text: Y.Text,
    range: WordRange,
    options: { styles?: WordStyles; attributes?: TextAttributes } = {},
  ) {
    const value = text.toString();
    const end = value.indexOf('\n', range.start);
    if (range.end !== end) return;
    const attributes = options.attributes ?? commands.wordFormats(text, range);
    const current = attributes.styleId;
    const styles = wordAuthoringStyles(options.styles);
    const next = current ? styles.style(current)?.next : undefined;
    const nextStyle = next && next !== current && styles.style(next)?.type === 'paragraph' ? next : undefined;
    const edit = positionedWordEdit(text, (staged) => {
      staged.applyDelta(commands.replaceWordDelta(staged, range, '\n', attributes));
      const start = range.start + 1;
      const caret = { start, end: start };
      if (nextStyle)
        staged.applyDelta(prepareOperation(staged, caret, { name: 'style', input: { styleId: nextStyle } }).delta);
      else {
        const character: WordFormatPatch = {};
        for (const key of continuedCharacterKeys)
          Object.assign(character, { [key]: attributes[key] ?? null });
        staged.applyDelta(commands.formatWordDelta(staged, caret, character));
      }
      return caret;
    });
    commands.validateWordDelta(text, edit.delta);
    return { ...edit, styleChanged: nextStyle !== undefined };
  };
}
