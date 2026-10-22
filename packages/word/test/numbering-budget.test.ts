import { expect, test } from 'bun:test';
import { createWordArtifact } from '../src/create.ts';
import { WordError } from '../src/document.ts';
import { formatWordNumber, WordNumbering, type WordNumberFormat } from '../src/numbering.ts';

function numbering(start: number, text = '%1.', format: WordNumberFormat = 'upperRoman') {
  return new WordNumbering({
    abstracts: [{ id: 1, levels: [{ level: 0, start, format, text, suffix: 'tab', indentStartTwips: undefined, hangingTwips: undefined }] }],
    instances: [{ id: 1, abstractId: 1, startOverrides: new Map(), levelOverrides: new Map() }],
  });
}
const references = (count: number) => Array.from({ length: count }, (_, elementId) => ({ elementId, reference: { numId: 1, level: 0 } }));

test('rejects extreme Roman expansion before generating its derived text', () => {
  expect(() => numbering(2147483647).markersFor(references(1))).toThrow(WordError);
  try { numbering(2147483647).markersFor(references(1)); } catch (error) {
    expect(error).toBeInstanceOf(WordError);
    expect((error as WordError).code).toBe('limit_exceeded');
  }
});

test('allows callers to opt into large Roman output without changing numeral semantics', () => {
  const text = numbering(2147483647).markersFor(references(1), { maxCharacters: 2147492 }).get(0)!.text;
  expect(text.length).toBe(2147491);
  expect(text).toBe('M'.repeat(2147483) + 'DCXLVII.');
  expect(() => numbering(2147483647).markersFor(references(1), { maxCharacters: 2147491 })).toThrow('budget');
});

test.each([0, 1, 4, 9, 3999, 4000, 32767])('preserves Roman values at %i without imposing a 3999 boundary', value => {
  const expected = ['I', 'I', 'IV', 'IX', 'MMMCMXCIX', 'MMMM', 'M'.repeat(32) + 'DCCLXVII'][[0, 1, 4, 9, 3999, 4000, 32767].indexOf(value)]!;
  expect(formatWordNumber(value, 'upperRoman')).toBe(expected);
  expect(formatWordNumber(value, 'lowerRoman')).toBe(expected.toLowerCase());
});

test('accounts for repeated placeholders, literal text and suffixes cumulatively', () => {
  const n = numbering(1, '[%1/%1]');
  expect([...n.markersFor(references(2), { maxCharacters: 14 }).values()].map(m => m.text)).toEqual(['[I/I]', '[II/II]']);
  expect(() => n.markersFor(references(2), { maxCharacters: 13 })).toThrow('budget');
  expect(() => numbering(1, '😀', 'bullet').markersFor(references(2), { maxCharacters: 5 })).toThrow('budget');
  expect(numbering(1, '😀', 'bullet').markersFor(references(2), { maxCharacters: 6 }).size).toBe(2);
  expect(() => numbering(1).markersFor(references(1), { maxCharacters: -1 })).toThrow(RangeError);
});

test('does not charge placeholder source syntax as derived output', () => {
  const n = numbering(1, '%1%1', 'none');
  expect(n.markersFor(references(1), { maxCharacters: 1 }).get(0)?.text).toBe('');
});


test('parses the full start range and applies derived budget when resolving markers', () => {
  const artifact = createWordArtifact({ paragraphs: [{ runs: [{ text: 'One' }], list: { id: 'roman', kind: 'upperRoman', start: 2147483647 } }] });
  expect(artifact.document.numbering.abstracts[0]?.levels[0]?.start).toBe(2147483647);
  expect(() => artifact.document.numbering.markers(artifact.document)).toThrow('budget');
});
