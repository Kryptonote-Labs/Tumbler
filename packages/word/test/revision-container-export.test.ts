import { expect, test } from 'bun:test';
import { importWordContent, NativeWordDocument, openWordArtifact } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  const w = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const source = () => openWordArtifact(buildWordDocumentFixture({ conformance, documentXml:
    `<w:document xmlns:w="${w}" xmlns:x="urn:opaque"><w:body><w:p>` +
    '<w:ins w:id="0" w:author="Author" w:date="2020-01-01T00:00:00Z" x:keep="yes"><w:bookmarkStart w:id="7" w:name="Inside"/>' +
    '<w:r><w:t>First</w:t><w:tab/><w:t>Second</w:t></w:r><w:bookmarkEnd w:id="7"/></w:ins>' +
    '<w:del w:id="1" w:author="Author" w:date="2020-01-01T00:00:00Z"><w:r><w:delText>Deleted</w:delText></w:r></w:del>' +
    '</w:p></w:body></w:document>' }));
  test(`${conformance} revision markers and several source leaves stay in one original insertion`, () => {
    const artifact = source(), content = importWordContent(artifact);
    const model = new NativeWordDocument({ source: artifact });
    model.update([...content, { kind: 'paragraph', runs: [{ text: 'Neighbour' }] }]);
    const exported = model.artifact(), xml = exported.document.source;
    expect(xml.elements(w, 'ins')).toHaveLength(1);
    expect(xml.elements(w, 'del')).toHaveLength(1);
    expect(xml.elements(w, 'bookmarkStart')).toHaveLength(1);
    expect(xml.elements(w, 'bookmarkEnd')).toHaveLength(1);
    const insertion = xml.elements(w, 'ins')[0]!;
    expect(insertion.attributes.find(attribute => attribute.localName === 'keep')?.value).toBe('yes');
    expect(xml.source.slice(insertion.span.start, insertion.span.end)).toContain('<w:bookmarkStart');
    expect(xml.source.slice(insertion.span.start, insertion.span.end)).toContain('<w:bookmarkEnd');
    expect(importWordContent(exported)[0]).toMatchObject({ kind: 'paragraph', runs: content[0]!.kind === 'paragraph' ? content[0]!.runs.map(({ text, format }) => ({ text, format })) : [] });
  });
  test(`${conformance} splitting a source insertion between paragraphs keeps unique revision identities`, () => {
    const artifact = source(), content = importWordContent(artifact), paragraph = content[0]!;
    if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
    const model = new NativeWordDocument({ source: artifact });
    model.update([{ ...paragraph, runs: paragraph.runs.slice(0, 1) }, { ...paragraph, runs: paragraph.runs.slice(1) }]);
    const xml = model.artifact().document.source;
    const insertions = xml.elements(w, 'ins');
    expect(insertions).toHaveLength(2);
    const ids = insertions.map(element => element.attributes.find(attribute => attribute.namespaceUri === w && attribute.localName === 'id')!.value);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('0');
    for (const insertion of insertions) expect(insertion.attributes.find(attribute => attribute.localName === 'keep')?.value).toBe('yes');
    expect(xml.elements(w, 'bookmarkStart')).toHaveLength(1);
    expect(xml.elements(w, 'bookmarkEnd')).toHaveLength(1);
  });
  test(`${conformance} opaque alternative revisions remain exact beside rendered revisions`, () => {
    const opaque = '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:x="urn:opaque">' +
      '<mc:Choice Requires="x"><w:ins w:id="1" w:author="Keep"><w:r><w:t>Choice</w:t></w:r></w:ins></mc:Choice>' +
      '<mc:Fallback><w:ins w:id="1" w:author="Keep"><w:r><w:t>Fallback</w:t></w:r></w:ins></mc:Fallback></mc:AlternateContent>';
    const retained = ['del', 'moveFrom', 'moveTo'].map(kind => `<w:${kind} w:id="6" w:author="Opaque"><w:ins w:id="1" w:author="Keep"><w:r><w:t>Retained</w:t></w:r></w:ins></w:${kind}>`).join('');
    const input = source();
    const xml = input.document.source.source.replace('</w:body>', '<w:p>' + opaque + retained + '</w:p></w:body>');
    const artifact = openWordArtifact(buildWordDocumentFixture({ conformance, documentXml: xml }));
    const model = new NativeWordDocument({ source: artifact });
    model.update([...importWordContent(artifact), { kind: 'paragraph', runs: [{ text: 'Neighbour' }] }]);
    expect(model.artifact().document.source.source).toContain(opaque);
    expect(model.artifact().document.source.source).toContain(retained);
  });
}
