import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { openWordArtifact } from '../src/index.ts';
import { restoreWordSourceWhitespace } from '../src/collaboration/source-whitespace.ts';
import { wordSharedText } from '../src/collaboration/structured/view.ts';
import { createWordUndoManager, preflightWordUndo } from '../src/collaboration/structured/undo.ts';
import {
  validateWordSharedDocument,
  commitWordUpdate,
} from '../src/collaboration/structured/transactions.ts';
import { validateWordSourceTextUndo } from '../src/collaboration/source-text-undo.ts';
import { wordSourceTextRedoneRoot } from '../src/collaboration/source-text.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { bindWordSourceReplacement } from '../src/collaboration/source-replacement.ts';

function legacy(lexical: string) {
  const artifact = openWordArtifact(
    buildWordDocumentFixture({
      documentXml:
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' +
        lexical +
        '</w:t></w:r></w:p></w:body></w:document>',
    }),
  );
  const element = artifact.document.source.elements(
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    't',
  )[0]!;
  const raw = artifact.document.source
    .textContentOrigins(element)
    .map((part) => part.original)
    .join('');
  const doc = new Y.Doc(),
    text = doc.getText('body');
  text.insert(0, raw, { wordSource: element.id });
  text.insert(text.length, '\n', { wordParagraph: 100 });
  return { doc, text, artifact };
}
function clone(doc: Y.Doc) {
  const other = new Y.Doc();
  other.getText('body');
  Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
  return other;
}

for (const [source, canonical] of [
  ['A&#13;B', 'A\u2028B'],
  ['A\r\nB', 'A B'],
  ['A\nB', 'A B'],
] as const)
  test(`offline deletion retains its target across source projection: ${JSON.stringify(source)}`, () => {
    const { doc, text, artifact } = legacy(source),
      peer = clone(doc);
    try {
      const old = text.toDelta(),
        vector = Y.encodeStateVector(peer);
      peer.getText('body').delete(1, source.includes('\r\n') ? 2 : 1);
      const pending = Y.encodeStateAsUpdate(peer, vector);
      expect(restoreWordSourceWhitespace(text, artifact)).toBeGreaterThan(0);
      expect(text.toDelta()).toEqual(old);
      expect(wordSharedText(text).text.toString()).toBe(canonical + '\n');
      Y.applyUpdate(doc, pending);
      expect(wordSharedText(text).text.toString()).toBe('AB\n');
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
      expect(peer.getText('body').toDelta()).toEqual(text.toDelta());
      const reopened = clone(doc);
      try {
        expect(wordSharedText(reopened.getText('body')).text.toString()).toBe('AB\n');
      } finally {
        reopened.destroy();
      }
    } finally {
      doc.destroy();
      peer.destroy();
    }
  });

test('CRLF view coordinates cover both original characters for deletion, formatting and anchors', () => {
  const { doc, text, artifact } = legacy('A\r\nB');
  try {
    restoreWordSourceWhitespace(text, artifact);
    const view = wordSharedText(text),
      anchor = view.anchor({ start: 1, end: 2 });
    expect(view.resolve(anchor)).toEqual({ start: 1, end: 2 });
    view.applyDelta([{ retain: 1 }, { retain: 1, attributes: { bold: true } }]);
    const physical: { insert: string; attributes?: Record<string, unknown> }[] = text.toDelta();
    expect(physical.some((part) => part.insert === '\r\n' && part.attributes?.bold === true)).toBe(
      true,
    );
    view.applyDelta([{ retain: 1 }, { delete: 1 }]);
    expect(text.toString()).toBe('AB\n');
    expect(view.text.toString()).toBe('AB\n');
  } finally {
    doc.destroy();
  }
});

test('mapped paragraph and formatting operations return visible coordinates', () => {
  const { doc, text, artifact } = legacy('A\r\nB');
  try {
    restoreWordSourceWhitespace(text, artifact);
    const view = wordSharedText(text);
    const format = view.prepareOperation(
      { start: 2, end: 3 },
      { name: 'format', input: { bold: true } },
    );
    expect(format.range).toEqual({ start: 2, end: 3 });
    commitWordUpdate(doc, format);
    commitWordUpdate(
      doc,
      view.prepareOperation(
        { start: 0, end: 0 },
        { name: 'paragraph', input: { align: 'center' } },
      ),
    );
    const parts: { insert: string; attributes?: Record<string, unknown> }[] = view.text.toDelta();
    expect(parts.at(-1)!.attributes?.align).toBe('center');
    expect(parts.find((part) => part.insert === 'B')!.attributes?.bold).toBe(true);
  } finally {
    doc.destroy();
  }
});

test('ordinary raw insertions do not claim source undo provenance', () => {
  const { doc, text, artifact } = legacy('A\rB');
  try {
    restoreWordSourceWhitespace(text, artifact);
    const source: { insert: string; attributes?: Record<string, unknown> }[] = text.toDelta();
    text.insert(1, '\r', source[0]!.attributes);
    expect(wordSharedText(text).text.toString()).toBe('A\u2028 B\n');
  } finally {
    doc.destroy();
  }
});

test('forged undo provenance cannot turn an ordinary insertion into source text', () => {
  const { doc, text, artifact } = legacy('A\rB');
  let before: Y.Doc | undefined;
  try {
    restoreWordSourceWhitespace(text, artifact);
    before = clone(doc);
    const source = Y.createRelativePositionFromTypeIndex(text, 1).item!;
    text.insert(1, '\r');
    const inserted = Y.createRelativePositionFromTypeIndex(text, 1).item!;
    doc
      .getMap(wordSourceTextRedoneRoot)
      .set(JSON.stringify([inserted.client, inserted.clock]), [source.client, source.clock]);
    expect(() => validateWordSourceTextUndo(doc, before!)).toThrow(
      'Invalid source undo provenance',
    );
  } finally {
    before?.destroy();
    doc.destroy();
  }
});

test('undo provenance survives wire updates and cold reopen with mixed lexical CR spellings', () => {
  const { doc, text, artifact } = legacy('A\r\nB&#13;C\rD');
  const peer = clone(doc),
    origin = {},
    undo = createWordUndoManager(doc, { trackedOrigins: new Set([origin]), captureTimeout: 0 });
  try {
    restoreWordSourceWhitespace(text, artifact);
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    const view = wordSharedText(text);
    expect(view.text.toString()).toBe('A B\u2028C D\n');
    view.applyDelta([{ retain: 1 }, { delete: 5 }], origin);
    const beforeUndo = clone(doc);
    expect(preflightWordUndo(doc, undo)).toBe(true);
    undo.undo();
    expect(() => validateWordSourceTextUndo(doc, beforeUndo)).not.toThrow();
    beforeUndo.destroy();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    expect(view.text.toString()).toBe('A B\u2028C D\n');
    expect(wordSharedText(peer.getText('body')).text.toString()).toBe(view.text.toString());
    const reopened = clone(peer);
    try {
      expect(wordSharedText(reopened.getText('body')).text.toString()).toBe(view.text.toString());
      expect(() => validateWordSharedDocument(reopened)).not.toThrow();
    } finally {
      reopened.destroy();
    }
  } finally {
    undo.destroy();
    peer.destroy();
    doc.destroy();
  }
});

for (const action of ['whole delete', 'partial delete', 'interior insert', 'format'] as const)
  test(`cached field projection preserves offline ${action}`, () => {
    const { doc, text } = legacy('12'),
      peer = clone(doc);
    try {
      const vector = Y.encodeStateVector(peer),
        pendingText = peer.getText('body');
      if (action === 'whole delete') pendingText.delete(0, 2);
      else if (action === 'partial delete') pendingText.delete(1, 1);
      else if (action === 'interior insert') pendingText.insert(1, 'X');
      else pendingText.format(0, 2, { bold: true });
      bindWordSourceReplacement(text, 0, 2, '\uFFFC', { field: { kind: 'page' } });
      expect(wordSharedText(text).text.toString()).toBe('\uFFFC\n');
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, vector));
      const expected =
        action === 'whole delete'
          ? '\n'
          : action === 'partial delete'
            ? '1\n'
            : action === 'interior insert'
              ? '1X2\n'
              : '\uFFFC\n';
      expect(wordSharedText(text).text.toString()).toBe(expected);
      const reopened = clone(doc);
      try {
        expect(wordSharedText(reopened.getText('body')).text.toString()).toBe(expected);
        if (action === 'format') {
          const parts: { attributes?: Record<string, unknown> }[] = wordSharedText(
            reopened.getText('body'),
          ).text.toDelta();
          expect(parts[0]!.attributes?.bold).toBe(true);
        }
      } finally {
        reopened.destroy();
      }
    } finally {
      peer.destroy();
      doc.destroy();
    }
  });

test('cached field undo provenance travels to peers and survives reopen', () => {
  const { doc, text } = legacy('12'),
    peer = clone(doc),
    origin = {};
  const undo = createWordUndoManager(doc, { trackedOrigins: new Set([origin]), captureTimeout: 0 });
  try {
    bindWordSourceReplacement(text, 0, 2, '\uFFFC', { field: { kind: 'page' } });
    const view = wordSharedText(text);
    view.applyDelta([{ delete: 1 }], origin);
    expect(view.text.toString()).toBe('\n');
    expect(preflightWordUndo(doc, undo)).toBe(true);
    undo.undo();
    expect(view.text.toString()).toBe('\uFFFC\n');
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    const reopened = clone(peer);
    try {
      expect(wordSharedText(reopened.getText('body')).text.toString()).toBe('\uFFFC\n');
    } finally {
      reopened.destroy();
    }
  } finally {
    undo.destroy();
    peer.destroy();
    doc.destroy();
  }
});

for (const start of [0, 1])
  for (const format of [{ bold: true }, { color: '#ff0000' }, { font: 'serif' }])
    test(`partial cached field formatting stays literal: ${start} ${JSON.stringify(format)}`, () => {
      const { doc, text } = legacy('12'),
        peer = clone(doc);
      try {
        const vector = Y.encodeStateVector(peer);
        peer.getText('body').format(start, 1, format);
        bindWordSourceReplacement(text, 0, 2, '\uFFFC', { field: { kind: 'page' } });
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, vector));
        const reopened = clone(doc);
        try {
          const projected = wordSharedText(reopened.getText('body')).text;
          expect(projected.toString()).toBe('12\n');
          const delta: { insert: string; attributes?: Record<string, unknown> }[] =
            projected.toDelta();
          expect(delta[start]!.insert).toBe(String(start + 1));
          expect(delta[start]!.attributes).toMatchObject(format);
          for (const key of Object.keys(format))
            expect(delta[1 - start]!.attributes?.[key]).toBeUndefined();
        } finally {
          reopened.destroy();
        }
      } finally {
        peer.destroy();
        doc.destroy();
      }
    });

for (const start of [1, 2])
  for (const format of [{ bold: true }, { color: '#ff0000' }, { link: 'https://example.com/' }])
    test(`partial CRLF formatting stays visible: ${start} ${JSON.stringify(format)}`, () => {
      const { doc, text, artifact } = legacy('A\r\nB'),
        peer = clone(doc);
      try {
        const vector = Y.encodeStateVector(peer);
        peer.getText('body').format(start, 1, format);
        restoreWordSourceWhitespace(text, artifact);
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, vector));
        const reopened = clone(doc);
        try {
          const projected = wordSharedText(reopened.getText('body')).text;
          expect(projected.toString()).toBe('A  B\n');
          const delta: { insert: string; attributes?: Record<string, unknown> }[] =
            projected.toDelta();
          expect(
            delta.find((part) =>
              Object.entries(format).every(([key, value]) => part.attributes?.[key] === value),
            )?.insert,
          ).toBe(' ');
          expect(reopened.getText('body').toDelta()).toEqual(text.toDelta());
        } finally {
          reopened.destroy();
        }
      } finally {
        peer.destroy();
        doc.destroy();
      }
    });

for (const lexical of ['A\rB', 'A\nB', 'A\r\nB'])
  test(`old offline undo with no source provenance rejects without losing pending bytes: ${JSON.stringify(lexical)}`, () => {
    const { doc, text, artifact } = legacy(lexical),
      peer = clone(doc);
    const undo = new Y.UndoManager(peer.getText('body'));
    try {
      const vector = Y.encodeStateVector(peer);
      peer.getText('body').delete(1, lexical.includes('\r\n') ? 2 : 1);
      undo.undo();
      restoreWordSourceWhitespace(text, artifact);
      const before = clone(doc);
      try {
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, vector));
        expect(() => validateWordSourceTextUndo(doc, before)).toThrow(
          'Ambiguous legacy source edit',
        );
        expect(peer.getText('body').toString()).toBe(lexical + '\n');
      } finally {
        before.destroy();
      }
    } finally {
      undo.destroy();
      peer.destroy();
      doc.destroy();
    }
  });
