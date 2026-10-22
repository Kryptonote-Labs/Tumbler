import { buildWordDocumentFixture } from './document-fixture.ts';
import { expect, test } from 'bun:test';
import { createWordArtifact, importWordContent, layoutWordDocument, NativeWordDocument, openWordArtifact } from '../src/index.ts';
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

test('shares the native budget across authored and imported markers and allows explicit opt-in', () => {
  const content = Array.from({ length: 2 }, () => ({ kind: 'paragraph' as const, runs: [{ text: 'One' }], list: { id: 'large', kind: 'upperRoman' as const, start: 600000000 } }));
  const source = createWordArtifact({ blocks: content });
  expect(() => new NativeWordDocument({ content })).toThrow('budget');
  expect(() => new NativeWordDocument({ source })).toThrow('budget');
  expect(() => layoutWordDocument(source.document, measurer)).toThrow('budget');
  const native = new NativeWordDocument({ content, maxMarkerCharacters: 2000000 });
  expect([...native.listMarkers.values()].reduce((sum, marker) => sum + marker.text.length + 1, 0)).toBe(1200005);
  expect(() => native.layout(measurer)).not.toThrow();
  expect(() => new NativeWordDocument({ source, maxMarkerCharacters: 2000000 }).layout(measurer)).not.toThrow();
  expect(() => layoutWordDocument(source.document, measurer, { maxMarkerCharacters: 2000000 })).not.toThrow();
  expect(() => native.layout(measurer, { maxMarkerCharacters: 1000000 })).toThrow('budget');
  const mixed = importWordContent(source);
  mixed.push({ kind: 'paragraph', runs: [{ text: 'Authored' }], list: { id: 'new', kind: 'upperRoman', start: 600000000 } });
  expect(() => new NativeWordDocument({ source, content: mixed, maxMarkerCharacters: 1800007 })).not.toThrow();
  expect(() => new NativeWordDocument({ source, content: mixed, maxMarkerCharacters: 1800006 })).toThrow('budget');
});

test('shares story budgets and rechecks cached markers under tighter layout limits', () => {
  const native = new NativeWordDocument({ content: [{ kind: 'paragraph', runs: [{ text: 'Body' }], list: { id: 'b', kind: 'decimal' } }] });
  native.updateStory({ kind: 'header', type: 'default', section: 0 }, [{ kind: 'paragraph', runs: [{ text: 'Header' }], list: { id: 'h', kind: 'decimal' } }]);
  const source = native.artifact();
  expect(() => layoutWordDocument(source.document, measurer, { maxMarkerCharacters: 6 })).not.toThrow();
  expect(() => layoutWordDocument(source.document, measurer, { maxMarkerCharacters: 5 })).toThrow('budget');
});

const measurer = { measure: (_text: string) => ({ width: 1, ascent: 8, descent: 2 }) };

test.each([
  { cached: false, bySection: false }, { cached: true, bySection: false },
  { cached: false, bySection: true }, { cached: true, bySection: true },
])('budgets only replacement headers: %j', ({ cached, bySection }) => {
  const source = hugeHeaderSource();
  if (cached) expect(() => layoutWordDocument(source.document, measurer, { maxMarkerCharacters: 3000000 })).not.toThrow();
  const native = new NativeWordDocument({ source });
  const partName = source.document.headerFooters[0]!.part.name.value;
  native.updateStory(bySection ? { kind: 'header', type: 'default', section: 0 } : partName, [{ kind: 'paragraph', runs: [{ text: 'Replacement' }] }]);
  expect(native.layout(measurer, { maxMarkerCharacters: 0 }).pages).toHaveLength(1);
  const progressive = native.layoutProgressively(measurer, { maxMarkerCharacters: 0 });
  let step = progressive.next();
  while (!step.done) step = progressive.next();
  expect(step.value.pages).toHaveLength(1);
  expect(layoutWordDocument(native.artifact().document, measurer, { maxMarkerCharacters: 0 }).pages).toHaveLength(1);
  expect(() => layoutWordDocument(source.document, measurer)).toThrow('budget');
});

function hugeHeaderSource() {
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${word}" xmlns:r="${office}"><w:body><w:p><w:r><w:t>Body</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="header"/></w:sectPr></w:body></w:document>`,
    relationships: [{ id: 'header', type: `${office}/header`, target: 'header1.xml' }, { id: 'n', type: `${office}/numbering`, target: 'numbering.xml' }],
    parts: [
      { itemName: 'word/header1.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml', xml: `<w:hdr xmlns:w="${word}"><w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>` },
      { itemName: 'word/numbering.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml', xml: `<w:numbering xmlns:w="${word}"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="2147483647"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>` },
    ],
  }));
}
