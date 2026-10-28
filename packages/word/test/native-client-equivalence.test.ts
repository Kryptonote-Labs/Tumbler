import { expect, test } from 'bun:test';
import * as fc from 'fast-check';
import * as Y from 'yjs';
import { applyTrackedWordDelta } from '../src/collaboration/text-events.ts';
import { wordTextRange } from '../src/collaboration/text-range.ts';
import { WordParagraphProjection } from '../src/collaboration/paragraph-projection.ts';
import type { WordDelta } from '../src/collaboration/commands.ts';

test('native edits remain wire-equivalent to standard clients across delayed sync and undo', () => {
  fc.assert(fc.property(fc.array(fc.record({
    kind: fc.constantFrom('insert', 'delete', 'format', 'sync', 'undo', 'redo'),
    peer: fc.nat(1), at: fc.nat(1000), count: fc.integer({ min: 1, max: 6 }),
    text: fc.constantFrom('x', 'é', '中', '😀', 'e\u0301', '\n'), bold: fc.boolean(),
  }), { minLength: 20, maxLength: 70 }), actions => {
    const seed = new Y.Doc();
    seed.clientID = 100;
    seed.getText('body').applyDelta([
      { insert: 'First 😀 e\u0301 ', attributes: { bold: true, wordSource: 4 } },
      { insert: 'second formatted string\n', attributes: { italic: true, wordSource: 8 } },
    ]);
    const make = () => [201, 302].map(client => {
      const doc = new Y.Doc();
      doc.getText('body');
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(seed));
      doc.clientID = client;
      const text = doc.getText('body');
      return { doc, text, undo: new Y.UndoManager(text, { captureTimeout: 0 }),
        projection: new WordParagraphProjection(text, slice => slice.parts) };
    });
    const native = make(), standard = make();
    const expand = (parts: readonly { insert: string; attributes?: Readonly<Record<string, unknown>> }[]) => parts.flatMap(part =>
      Array.from({ length: part.insert.length }, (_, at) => ({ text: part.insert[at], attributes: part.attributes ?? {} })));
    const check = () => {
      for (let index = 0; index < native.length; index++) {
        const actual = native[index]!, expected = standard[index]!;
        expect(actual.text.toDelta()).toEqual(expected.text.toDelta());
        expect(Y.encodeStateAsUpdate(actual.doc)).toEqual(Y.encodeStateAsUpdate(expected.doc));
        expect(expand(wordTextRange(actual.text))).toEqual(expand(expected.text.toDelta()));
        expect(expand(actual.projection.paragraphs.flat())).toEqual(expand(expected.text.toDelta()));
      }
    };
    const sync = () => {
      for (const network of [native, standard]) {
        const updates = network.map(({ doc }) => Y.encodeStateAsUpdate(doc));
        // Duplicate delivery is intentional, as a reconnect can resend an acknowledged update.
        for (let index = 0; index < network.length; index++) {
          Y.applyUpdate(network[index]!.doc, updates[1 - index]!, 'remote');
          Y.applyUpdate(network[index]!.doc, updates[1 - index]!, 'remote');
        }
      }
    };
    try {
      check();
      for (const action of actions) {
        if (action.kind === 'sync') sync();
        else for (const [index, network] of [native, standard].entries()) {
          const { text, undo } = network[action.peer]!;
          if (action.kind === 'undo') undo.undo();
          else if (action.kind === 'redo') undo.redo();
          else {
            const value = text.toString();
            // Match the command API's UTF-16 boundary contract on both peers.
            const boundary = (at: number) => value.charCodeAt(at - 1) >= 0xd800 &&
              value.charCodeAt(at - 1) <= 0xdbff && value.charCodeAt(at) >= 0xdc00 &&
              value.charCodeAt(at) <= 0xdfff ? at - 1 : at;
            const at = boundary(action.at % (text.length + 1));
            const count = boundary(Math.min(at + action.count, text.length)) - at;
            const delta: WordDelta = [...(at ? [{ retain: at }] : []),
              ...(action.kind === 'insert' ? [{ insert: action.text, attributes: { bold: action.bold, wordSource: 4 } }]
                : action.kind === 'delete' ? [{ delete: count }]
                : [{ retain: count, attributes: { italic: action.bold ? true : null } }])];
            if (index === 0) applyTrackedWordDelta(text, delta);
            else text.applyDelta(structuredClone(delta));
          }
        }
        check();
      }
      sync();
      check();
      // Concurrent formatting can retain adjacent equal runs with different boundaries.
      expect(expand(native[0]!.text.toDelta())).toEqual(expand(native[1]!.text.toDelta()));
    } finally {
      seed.destroy();
      for (const { doc, undo, projection } of [...native, ...standard]) { projection.destroy(); undo.destroy(); doc.destroy(); }
    }
  }), { numRuns: 120 });
}, 30_000);

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
