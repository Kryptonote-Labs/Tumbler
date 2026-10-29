import type * as Y from 'yjs';
import { isWordParagraphPositioning } from '../positioning.ts';
import type { WordTabStop } from '../styles.ts';
import { createWordCommands, type WordRange } from './commands.ts';
const { validateWordRange } = createWordCommands();
import { wordTextIndex } from './text-index.ts';

/** Edit one stop independently in each selected paragraph without replacing its other stops. */
export function wordTabStopPatches(text: Y.Text, range: WordRange, stop: WordTabStop, previousPosition?: number) {
  validateWordRange(text, range);
  if (!isWordParagraphPositioning({ tabs: [stop, ...(previousPosition === undefined ? [] : [{ positionTwips: previousPosition, alignment: 'clear', leader: 'none' }])] }))
    throw new TypeError('Invalid tab stop.');
  const last = range.start === range.end ? range.end : range.end - 1;
  return wordTextIndex(text).paragraphs()
    .filter(paragraph => paragraph.start <= last && paragraph.end > range.start)
    .map(paragraph => {
      const direct = paragraph.attributes?.positioning;
      const tabs = isWordParagraphPositioning(direct) ? direct.tabs ?? [] : [];
      const next = tabs.filter(tab => tab.positionTwips !== stop.positionTwips && tab.positionTwips !== previousPosition);
      if (previousPosition !== undefined && previousPosition !== stop.positionTwips)
        next.push({ positionTwips: previousPosition, alignment: 'clear', leader: 'none' });
      next.push(stop);
      return { range: { start: paragraph.start, end: paragraph.start }, positioning: { tabs: next.sort((a,b) => a.positionTwips - b.positionTwips) } };
    });
}
