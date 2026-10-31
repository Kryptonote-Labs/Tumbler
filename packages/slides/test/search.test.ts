import { expect, test } from 'bun:test';
import {
  applyPresentationCommand as run,
  createPresentation,
  findPresentationMatches,
  openPresentationArtifact,
  rebasePresentationCommands,
  slideTextValue,
} from '../src/index.ts';
function fixture() {
  let deck = createPresentation();
  const slideId = deck.document.slides[0]!.id;
  deck = run(deck, {
    name: 'insert-object',
    slideId,
    bounds: { x: 0, y: 0, width: 400, height: 200 },
    object: { kind: 'shape', text: 'Cat cats CAT café Cafe\u0301 a.b 😀' },
  });
  return { deck, slideId };
}
test('find counts occurrences and shares Word case, word, literal and Unicode boundaries', () => {
  const { deck } = fixture();
  expect(findPresentationMatches(deck.document, 'cat')).toHaveLength(3);
  expect(findPresentationMatches(deck.document, 'cat', { wholeWord: true })).toHaveLength(2);
  expect(findPresentationMatches(deck.document, 'CAT', { matchCase: true })).toHaveLength(1);
  expect(
    findPresentationMatches(deck.document, 'café').map((match) => [match.start, match.end]),
  ).toEqual([
    [13, 17],
    [18, 23],
  ]);
  expect(findPresentationMatches(deck.document, 'a.b')).toHaveLength(1);
  expect(findPresentationMatches(deck.document, 'e')).toHaveLength(0);
  expect(findPresentationMatches(deck.document, '')).toEqual([]);
});
test('replace-all addresses table cells, preserves other cells and round-trips Unicode replacements', () => {
  let { deck, slideId } = fixture();
  deck = run(deck, {
    name: 'insert-object',
    slideId,
    bounds: { x: 0, y: 0, width: 400, height: 200 },
    object: { kind: 'table', rows: 2, columns: 2 },
  });
  const objectKey = deck.document.slides[0]!.objects.at(-1)!.key;
  deck = run(deck, {
    name: 'edit-text',
    slideId,
    objectKey,
    cell: { row: 0, column: 0 },
    start: 0,
    end: 0,
    value: 'cat cat cats',
  });
  deck = run(deck, {
    name: 'edit-text',
    slideId,
    objectKey,
    cell: { row: 1, column: 1 },
    start: 0,
    end: 0,
    value: 'unchanged',
  });
  const matches = findPresentationMatches(deck.document, 'cat', { wholeWord: true });
  expect(matches).toHaveLength(4);
  expect(matches.filter((match) => match.cell).map((match) => match.cell)).toEqual([
    { row: 0, column: 0 },
    { row: 0, column: 0 },
  ]);
  deck = run(deck, {
    name: 'replace-all',
    find: 'cat',
    value: 'kitten',
    caseSensitive: false,
    wholeWord: true,
  });
  const reopened = openPresentationArtifact(deck.bytes());
  const table = reopened.document.slides[0]!.objects.at(-1)!.table!;
  expect(table.cells[0]!.text!.paragraphs[0]!.runs.map((run) => run.text).join('')).toBe(
    'kitten kitten cats',
  );
  expect(
    table.cells
      .at(-1)!
      .text!.paragraphs[0]!.runs.map((run) => run.text)
      .join(''),
  ).toBe('unchanged');
  deck = run(deck, { name: 'replace-all', find: 'café', value: 'tea', caseSensitive: false });
  expect(slideTextValue(deck.document.slides[0]!.objects[0]!)).toContain('tea tea');
  expect(findPresentationMatches(deck.document, 'café')).toEqual([]);
});

test('rebasing replace-all retains cell and whole-word targets from the original branch', () => {
  let { deck, slideId } = fixture();
  deck = run(deck, {
    name: 'insert-object',
    slideId,
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    object: { kind: 'table', rows: 1, columns: 1 },
  });
  const objectKey = deck.document.slides[0]!.objects.at(-1)!.key;
  deck = run(deck, {
    name: 'edit-text',
    slideId,
    objectKey,
    cell: { row: 0, column: 0 },
    start: 0,
    end: 0,
    value: 'cat cats',
  });
  const remote = { name: 'background' as const, slideId, color: '#123456' };
  const result = rebasePresentationCommands(
    deck,
    run(deck, remote),
    [{ name: 'replace-all', find: 'cat', value: 'dog', caseSensitive: false, wholeWord: true }],
    [remote],
  );
  const table = result.artifact.document.slides[0]!.objects.at(-1)!.table!;
  expect(table.cells[0]!.text!.paragraphs[0]!.runs.map((run) => run.text).join('')).toBe(
    'dog cats',
  );
  expect(findPresentationMatches(result.artifact.document, 'cat', { wholeWord: true })).toEqual([]);
});
