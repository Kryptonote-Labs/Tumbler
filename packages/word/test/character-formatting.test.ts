import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { createWordArtifact, importWordContent, NativeWordDocument, WORD_HIGHLIGHTS } from '../src/index.ts';
import { createWordCommands, validateAttributes } from '../src/collaboration/index.ts';

test('character properties survive authoring, imported edits and explicit clearing', () => {
  for (const highlight of WORD_HIGHLIGHTS) {
    const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'First', format: { strike: true, highlight, verticalAlign: 'superscript', characterSpacingPoints: 1.25 } }, { text: ' plain' }] }] });
    const blocks = importWordContent(source);
    const first = blocks[0]!;
    if (first.kind !== 'paragraph') throw Error('paragraph');
    expect(first.runs[0]!.format).toMatchObject({ strike: true, highlight, verticalAlign: 'superscript', characterSpacingPoints: 1.25 });
    const native = new NativeWordDocument({ source });
    native.update([{ ...first, runs: [{ ...first.runs[0]!, format: { ...first.runs[0]!.format, strike: false, highlight: 'none', verticalAlign: 'baseline', characterSpacingPoints: 0 } }, ...first.runs.slice(1)] }]);
    const edited = importWordContent(native.artifact())[0]!;
    if (edited.kind !== 'paragraph') throw Error('paragraph');
    expect(edited.runs[0]!.format).toMatchObject({ strike: false, highlight: 'none', verticalAlign: 'baseline', characterSpacingPoints: 0 });
    expect(edited.runs.map(run => run.text).join('')).toBe('First plain');
    expect(edited.runs.at(-1)!.format?.strike).toBe(false);
  }
});

test('collaborative character formatting reports mixed selections and supports undo', () => {
  const doc = new Y.Doc();
  const text = doc.getText('body');
  text.insert(0, 'one two\n');
  const undo = new Y.UndoManager(text);
  const commands = createWordCommands();
  text.applyDelta(commands.formatWordDelta(text, { start: 0, end: 3 }, { strike: true, highlight: 'yellow', verticalAlign: 'subscript', characterSpacingPoints: -0.5 }));
  expect(commands.wordFormats(text, { start: 0, end: 3 })).toMatchObject({ strike: true, highlight: 'yellow', verticalAlign: 'subscript', characterSpacingPoints: -0.5 });
  expect(commands.wordFormats(text, { start: 0, end: 7 }).highlight).toBeUndefined();
  undo.undo();
  expect(commands.wordFormats(text, { start: 0, end: 3 }).strike).toBeUndefined();
  for (const attributes of [{ highlight: 'pink' }, { characterSpacingPoints: Infinity }, { characterSpacingPoints: 0.001 }, { verticalAlign: 'top' }]) expect(() => validateAttributes(attributes)).toThrow();
  doc.destroy();
});
