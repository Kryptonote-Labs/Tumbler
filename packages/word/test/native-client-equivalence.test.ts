import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { applyTrackedWordDelta } from '../src/collaboration/text-events.ts';
import { wordTextRange } from '../src/collaboration/text-range.ts';
import { WordParagraphProjection } from '../src/collaboration/paragraph-projection.ts';

test('text caches reflect Yjs surrogate repairs when a raw insertion splits an emoji', () => {
  for (const tracked of [false, true]) for (const earlierObserver of [false, true]) {
    const doc = new Y.Doc(), text = doc.getText('body');
    text.insert(0, 'before 😀 after\n', { bold: true });
    let pending = earlierObserver;
    text.observe(() => {
      if (!pending) return;
      pending = false;
      text.insert(0, 'observer ');
    });
    const projection = new WordParagraphProjection(text, slice => slice.parts);
    try {
      wordTextRange(text);
      const delta = [{ retain: 8 }, { insert: 'x', attributes: { bold: true } }];
      if (tracked) applyTrackedWordDelta(text, delta);
      else text.applyDelta(delta);
      expect(text.toString()).toBe((earlierObserver ? 'observer ' : '') + 'before \uFFFDx\uFFFD after\n');
      expect(wordTextRange(text).map(part => part.insert).join('')).toBe(text.toString());
      expect(projection.paragraphs.flat().map(part => part.insert).join('')).toBe(text.toString());
    } finally { projection.destroy(); doc.destroy(); }
  }
});
