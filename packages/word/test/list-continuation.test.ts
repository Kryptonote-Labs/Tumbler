import { expect, test } from 'bun:test';
import { createWordArtifact, importWordContent, NativeWordDocument, openWordArtifact, reconcileWordContent } from '../src/index.ts';

import { buildWordDocumentFixture } from './document-fixture.ts';

const source = () => createWordArtifact({ paragraphs: ['One', 'Two'].map(text => ({ runs: [{ text }], list: { id: 'items', kind: 'decimal' as const } })) });

test('continues an imported identity in export and native markers, with explicit restarts', () => {
  const original = source();
  const content = importWordContent(original);
  const item = content[1]!;
  if (item.kind !== 'paragraph' || !item.list) throw new Error('Expected list');
  content.push({ kind: 'paragraph', runs: [{ text: 'Three' }], list: item.list });
  content.push({ kind: 'paragraph', runs: [{ text: 'Restart' }], list: { ...item.list, id: 'restart' } });
  content.push({ kind: 'paragraph', runs: [{ text: 'Four' }], list: item.list });
  const exported = reconcileWordContent(original, content);
  expect([...exported.document.numbering.markers(exported.document).values()].map(m => m.text)).toEqual(['1.', '2.', '3.', '1.', '4.']);
  const native = new NativeWordDocument({ source: original, content });
  expect(native.blocks.map(b => native.listMarkers.get(b.elementId)?.text)).toEqual(['1.', '2.', '3.', '1.', '4.']);
  expect(exported.document.numbering.instances).toHaveLength(2);
});

test.each(['transitional', 'strict'] as const)('preserves %s source instances, overrides and nested levels', conformance => {
  const word = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const office = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const p = (level: number) => `<x:p><x:pPr><x:numPr><x:ilvl x:val="${level}"/><x:numId x:val="42"/></x:numPr></x:pPr><x:r><x:t>Item</x:t></x:r></x:p>`;
  const xml = `<x:numbering xmlns:x="${word}"><x:abstractNum x:abstractNumId="7"><x:lvl x:ilvl="0"><x:start x:val="1"/><x:numFmt x:val="upperRoman"/><x:lvlText x:val="%1)"/></x:lvl><x:lvl x:ilvl="1"><x:start x:val="1"/><x:numFmt x:val="lowerLetter"/><x:lvlText x:val="%1.%2)"/></x:lvl></x:abstractNum><x:num x:numId="42"><x:abstractNumId x:val="7"/><x:lvlOverride x:ilvl="0"><x:startOverride x:val="3"/></x:lvlOverride></x:num></x:numbering>`;
  const original = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<x:document xmlns:x="${word}"><x:body>${p(0)}${p(1)}</x:body></x:document>`,
    relationships: [{ id: 'numbering', type: `${office}/numbering`, target: 'numbering.xml' }],
    parts: [{ itemName: 'word/numbering.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml', xml }],
  }));
  const content = importWordContent(original);
  const item = content[1]!;
  if (item.kind !== 'paragraph' || !item.list) throw new Error('Expected list');
  content.push({ kind: 'table', rows: [[{ blocks: [{ kind: 'paragraph', runs: [{ text: 'Nested continuation' }], list: item.list }] }]] });
  content.push({ kind: 'paragraph', runs: [{ text: 'Top continuation' }], list: { ...item.list, kind: 'upperRoman', level: 0 } });
  const exported = reconcileWordContent(original, content);
  expect([...exported.document.numbering.markers(exported.document).values()].map(m => m.text)).toEqual(['III)', 'III.a)', 'III.b)', 'IV)']);
  expect(new TextDecoder().decode(exported.document.package.readPart(exported.document.package.getPart('/word/numbering.xml')!))).toBe(xml);
  const native = new NativeWordDocument({ source: original, content });
  expect([...native.listMarkers.values()].map(m => m.text)).toEqual(['III)', 'III.a)', 'III.b)', 'IV)']);
});
