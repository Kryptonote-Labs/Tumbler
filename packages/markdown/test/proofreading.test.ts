import { expect, test } from 'bun:test';
import { parseNote } from '../src/index';
import { noteProseSnapshot } from '../src/proofreading';

test('proofreading reads whole formatted words and excludes inline and block code', () => {
  const document = parseNote('app**reci**atedd and `ignoreInline`\n\n```java\nignoreBlock();\n```');
  const snapshot = noteProseSnapshot(document);
  expect(snapshot.text).toStartWith('appreciatedd and');
  expect(snapshot.text).not.toContain('ignoreInline');
  expect(snapshot.text).not.toContain('ignoreBlock');
  const word = 'appreciatedd';
  const range = snapshot.range(0, word.length);
  expect(range).toEqual({ from: 1, to: word.length + 1 });
  expect(document.textBetween(range!.from, range!.to)).toBe(word);
  const codeStart = snapshot.text.indexOf('  ');
  expect(snapshot.range(codeStart, codeStart + 'ignoreInline'.length)).toBeUndefined();
});
