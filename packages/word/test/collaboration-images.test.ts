import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
  createWordCommands,
  documentImageRefs,
  validateWordText,
  type DocumentImage,
} from '../src/collaboration/index.ts';

const image: DocumentImage = {
  id: 'imported-image',
  type: 'image/png',
  width: 455.36,
  height: 155.89,
  alt: 'A screenshot of a computer\n\nDescription automatically generated',
};

test('multiline image descriptions survive collaborative edits and synchronization', () => {
  const doc = new Y.Doc();
  const peer = new Y.Doc();
  try {
    const body = doc.getText('body');
    const reference = { ...image, alt: `${image.alt}\r\nDetails\t📷` };
    body.applyDelta([{ insert: '\uFFFC', attributes: { image: reference } }, { insert: '\n' }]);
    const commands = createWordCommands();
    body.applyDelta(commands.replaceWordDelta(body, { start: 0, end: 0 }, 'Caption '));
    expect(() => validateWordText(body)).not.toThrow();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
    expect(documentImageRefs(peer.getText('body')).get(image.id)).toEqual(reference);
    expect(peer.getText('body').toString()).toBe('Caption \uFFFC\n');
  } finally {
    doc.destroy();
    peer.destroy();
  }
});

test('image descriptions still reject invalid XML characters and malformed Unicode', () => {
  for (const character of ['\0', '\u0008', '\u000b', '\u000c', '\u000e', '\u001f', '\ufffe', '\uffff', '\ud800', '\udc00']) {
    const doc = new Y.Doc();
    try {
      const body = doc.getText('body');
      body.insert(0, '\uFFFC', { image: { ...image, alt: `Before${character}after` } });
      expect(() => documentImageRefs(body)).toThrow('Invalid document image.');
    } finally {
      doc.destroy();
    }
  }
});
