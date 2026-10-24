import { expect, test } from 'bun:test';
import { OOXML_NAMESPACES } from '@tumblerjs/ooxml';
import { openZipArchive, writeZipArchiveChanges } from '@tumblerjs/opc';
import { openWordArtifact, readWordEmbeddedFonts } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const key = '{001B70DC-AA60-4AD5-90EC-18A0948E1EAE}';
const bytes = Uint8Array.from({ length: 64 }, (_, index) => index);
// ECMA-376 §17.8.1's example GUID in reversed byte order.
const reversed = [0xae, 0x1e, 0x8e, 0x94, 0xa0, 0x18, 0xec, 0x90, 0xd5, 0x4a, 0x60, 0xaa, 0xdc, 0x70, 0x1b, 0x00];
const encoded = bytes.map((value, index) => index < 32 ? value ^ reversed[index % 16]! : value);
function fixture(conformance: 'strict' | 'transitional', fontKey: string | undefined = key, external = false) {
  const ns = OOXML_NAMESPACES[conformance].wordprocessing;
  const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const source = buildWordDocumentFixture({ conformance,
    relationships: [{ id: 'fonts', type: `${rel}/fontTable`, target: 'fontTable.xml' }],
    parts: [
      { itemName: 'word/fontTable.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml', xml: `<w:fonts xmlns:w="${ns}" xmlns:r="${rel}"><w:font w:name="Example"><w:embedBoldItalic r:id="font"${fontKey === undefined ? '' : ` w:fontKey="${fontKey}"`}/></w:font></w:fonts>` },
      { itemName: 'word/_rels/fontTable.xml.rels', contentType: 'application/vnd.openxmlformats-package.relationships+xml', xml: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="font" Type="${rel}/font" Target="font.odttf"${external ? ' TargetMode="External"' : ''}/></Relationships>` },
      { itemName: 'word/font.odttf', contentType: 'application/vnd.openxmlformats-officedocument.obfuscatedFont', xml: '' },
    ],
  });
  return openWordArtifact(writeZipArchiveChanges(openZipArchive(source), { replacements: new Map([['word/font.odttf', encoded]]) }));
}
for (const conformance of ['strict', 'transitional'] as const) test(`${conformance} embedded fonts decode without changing package data`, () => {
  const artifact = fixture(conformance);
  const fonts = readWordEmbeddedFonts(artifact.document);
  expect(fonts).toHaveLength(1);
  expect(fonts[0]).toMatchObject({ family: 'Example', bold: true, italic: true });
  expect(fonts[0]!.bytes).toEqual(bytes);
  expect(readWordEmbeddedFonts(artifact.document)).toBe(fonts);
  const archive = openZipArchive(artifact.bytes());
  expect(archive.read(archive.get('word/font.odttf')!)).toEqual(encoded);
});
test('invalid keys and external font targets do not supply font data', () => {
  expect(readWordEmbeddedFonts(fixture('transitional', 'bad-key').document)).toEqual([]);
  expect(readWordEmbeddedFonts(fixture('transitional', undefined, true).document)).toEqual([]);
});
