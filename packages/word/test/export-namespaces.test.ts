import { expect, test } from 'bun:test';
import { openWordArtifact, importWordContent, reconcileWordContent } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

test('export does not multiply root namespace declarations across every run', () => {
  const declarations = Array.from({ length: 30 }, (_, i) => `xmlns:ext${i}="urn:extension:${i}"`).join(' ');
  const text = `<w:document xmlns:w="${w}" ${declarations}><w:body>${Array.from({ length: 80 }, (_, i) => `<w:p><w:r><w:t>Paragraph ${i}</w:t></w:r></w:p>`).join('')}<w:sectPr/></w:body></w:document>`;
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: text }));
  const blocks = importWordContent(source);
  const exported = reconcileWordContent(source, [...blocks, { kind: 'paragraph', runs: [{ text: 'Added' }] }]);
  expect(exported.document.source.source.length).toBeLessThan(text.length * 3);
  expect(importWordContent(exported).map(p => p.kind === 'paragraph' ? p.runs.map(r => r.text).join('') : '')).toEqual([...Array.from({ length: 80 }, (_, i) => `Paragraph ${i}`), 'Added']);
});

test('moving runs preserves locally rebound prefixes and opaque attributes', () => {
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${w}" xmlns:q="urn:root"><w:body><w:p xmlns:q="urn:first"><w:r q:hint="q:Token"><w:t>Moved</w:t><q:payload/></w:r></w:p><w:p xmlns:q="urn:second"><w:r><w:t>Destination</w:t></w:r></w:p><w:sectPr/></w:body></w:document>` }));
  const [first, second] = importWordContent(source);
  if (first?.kind !== 'paragraph' || second?.kind !== 'paragraph') throw new Error('Expected paragraphs');
  const exported = reconcileWordContent(source, [{ ...second, runs: [...second.runs, ...first.runs] }]);
  expect(exported.document.source.elements('urn:first', 'payload')).toHaveLength(1);
  expect(exported.document.source.elements('urn:second', 'payload')).toHaveLength(0);
  const run = exported.document.source.elements(w, 'r').find(element => element.attributes.some(a => a.localName === 'hint'))!;
  expect(run.attributes.find(a => a.localName === 'hint')).toMatchObject({ namespaceUri: 'urn:first', value: 'q:Token' });
  expect(run.attributes.find(a => a.qualified === 'xmlns:q')?.value).toBe('urn:first');
});

test('root-equivalent bindings are retained when a prefix is shadowed elsewhere', () => {
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${w}" xmlns:q="urn:root"><w:body><w:p><w:r q:hint="q:Token"><w:t>Root</w:t><q:payload/></w:r></w:p><w:p xmlns:q="urn:local"><w:r><w:t>Local</w:t></w:r></w:p><w:sectPr/></w:body></w:document>` }));
  const [first, second] = importWordContent(source);
  if (first?.kind !== 'paragraph' || second?.kind !== 'paragraph') throw new Error('Expected paragraphs');
  const exported = reconcileWordContent(source, [{ ...second, runs: [...second.runs, ...first.runs] }]);
  expect(exported.document.source.elements('urn:root', 'payload')).toHaveLength(1);
  expect(exported.document.source.elements('urn:local', 'payload')).toHaveLength(0);
});

test.each([
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
])('export preserves alternate prefixes and opaque QName values in %s', namespace => {
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<x:document xmlns:x="${namespace}" xmlns:w="urn:custom" xmlns:q="urn:opaque"><x:body><x:p><x:r q:hint="q:Token"><x:t>Before</x:t><w:payload/></x:r></x:p><x:sectPr/></x:body></x:document>` }));
  const [paragraph] = importWordContent(source);
  if (paragraph?.kind !== 'paragraph') throw new Error('Expected paragraph');
  const result = reconcileWordContent(source, [{ ...paragraph, runs: paragraph.runs.map(run => ({ ...run, text: 'After' })) }]);
  expect(result.document.source.elements('urn:custom', 'payload')).toHaveLength(1);
  expect(result.document.source.elements(namespace, 't').some(element => result.document.source.source.slice(element.span.start, element.span.end).includes('After'))).toBe(true);
  expect(result.document.source.elements(namespace, 'r')[0]!.attributes.find(a => a.localName === 'hint')).toMatchObject({ namespaceUri: 'urn:opaque', value: 'q:Token' });
});

test('default namespace rebinding survives content movement', () => {
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${w}" xmlns="urn:root"><w:body><w:p xmlns="urn:first"><w:r><w:t>First</w:t><payload/></w:r></w:p><w:p xmlns="urn:second"><w:r><w:t>Second</w:t></w:r></w:p><w:sectPr/></w:body></w:document>` }));
  const [first, second] = importWordContent(source);
  if (first?.kind !== 'paragraph' || second?.kind !== 'paragraph') throw new Error('Expected paragraphs');
  const result = reconcileWordContent(source, [{ ...second, runs: [...second.runs, ...first.runs] }]);
  expect(result.document.source.elements('urn:first', 'payload')).toHaveLength(1);
  expect(result.document.source.elements('urn:second', 'payload')).toHaveLength(0);
});
