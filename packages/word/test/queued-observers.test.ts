import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { applyTrackedWordDelta } from '../src/collaboration/text-events.ts';
import { wordTextRange } from '../src/collaboration/text-range.ts';
import { WordParagraphProjection } from '../src/collaboration/paragraph-projection.ts';
import { wordParagraphIdentity } from '../src/collaboration/paragraph-identity.ts';
import { WordSharedText } from '../src/collaboration/structured/view.ts';
import { legacyTables } from '../src/collaboration/structured/legacy-tables.ts';
import { insertTableDelta } from '../src/collaboration/tables.ts';

for (const tracked of [false, true]) for (const batch of [false, true]) for (const syncInside of [false, true]) {
  test(`${tracked ? 'tracked' : 'standard'} caches survive earlier observer writes, batch=${batch}, syncInside=${syncInside}`, () => {
    const doc = new Y.Doc(), text = doc.getText('body');
    text.insert(0, 'first paragraph\nsecond 😀 paragraph\nlast paragraph\n', { bold: true });
    let armed = true;
    text.observe(() => {
      if (armed) { armed = false; text.insert(0, 'observer\n', { italic: true }); }
      expect(wordTextRange(text).map(part => part.insert).join('')).toBe(text.toString());
    });
    const projection = new WordParagraphProjection(text, slice => slice.parts);
    const view = new WordSharedText(doc, 'body');
    const check = () => {
      expect(wordTextRange(text).map(part => part.insert).join('')).toBe(text.toString());
      expect(projection.paragraphs.flat().map(part => part.insert).join('')).toBe(text.toString());
      expect(view.text.toString()).toBe(text.toString());
      for (let at = text.toString().indexOf('\n'); at >= 0; at = text.toString().indexOf('\n', at + 1)) {
        const id = Y.createRelativePositionFromTypeIndex(text, at).item!;
        expect(wordParagraphIdentity(text, at)).toBe(`${id.client}:${id.clock}`);
      }
    };
    text.observe(check);
    try {
      doc.transact(() => {
        const delta = [{ retain: 5 }, { insert: 'local', attributes: { bold: true } }];
        if (tracked) applyTrackedWordDelta(text, delta);
        else text.applyDelta(delta);
        if (batch) text.insert(3, 'batched', { bold: true });
        if (syncInside) view.sync();
      });
      check();
      text.delete(0, 3);
      check();
    } finally { projection.destroy(); view.destroy(); doc.destroy(); }
  });
}

test('paragraph projections read fresh before their own observer and when created during a write', () => {
  const doc = new Y.Doc(), text = doc.getText('body');
  text.insert(0, 'base\n');
  let projection: WordParagraphProjection<string>;
  text.observe(() => expect(projection.paragraphs.join('')).toBe(text.toString()));
  projection = new WordParagraphProjection(text, slice => slice.parts.map(part => part.insert).join(''));
  let created: WordParagraphProjection<string> | undefined;
  try {
    doc.transact(() => {
      text.insert(0, 'first ');
      expect(projection.paragraphs.join('')).toBe(text.toString());
      created = new WordParagraphProjection(text, slice => slice.parts.map(part => part.insert).join(''));
      text.insert(0, 'second ');
      expect(created.paragraphs.join('')).toBe(text.toString());
    });
    expect(projection.paragraphs.join('')).toBe(text.toString());
    expect(created!.paragraphs.join('')).toBe(text.toString());
    text.insert(0, 'third ');
    expect(created!.paragraphs.join('')).toBe(text.toString());
  } finally { projection.destroy(); created?.destroy(); doc.destroy(); }
});

test('legacy table discovery sees queued structural changes before its observer runs', () => {
  const doc = new Y.Doc(), text = doc.getText('body');
  text.insert(0, 'before\nafter\n');
  let armed = true;
  text.observe(() => {
    if (!armed) return;
    armed = false;
    text.applyDelta(insertTableDelta(text, text.length, [['new cell']]).delta);
    expect(legacyTables(text).size).toBe(1);
  });
  try {
    expect(legacyTables(text).size).toBe(0);
    applyTrackedWordDelta(text, [{ insert: 'trigger ' }]);
    expect(legacyTables(text).size).toBe(1);
  } finally { doc.destroy(); }
});
