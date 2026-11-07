import { expect, test } from 'bun:test';
import { beginPackageTransaction, openOpcPackage, openOpcPackageArchive, ZipArchive } from '../src/index.ts';
import { buildDeflatedZip } from './zip-builder.ts';

const encoder = new TextEncoder();
function fixture() {
  return openOpcPackage(buildDeflatedZip([
    { name: '[Content_Types].xml', data: encoder.encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>') },
    { name: 'data.xml', data: encoder.encode('<original/>') },
    { name: 'unknown.xml', data: encoder.encode('<preserve/>') },
  ]));
}

test('native commits reuse untouched members, survive snapshots and export on demand', () => {
  const original = fixture();
  const unknown = original.archive.compressedBytes(original.archive.get('unknown.xml')!);
  // Encoding the source ZIP is unnecessary, including during repeated commits.
  original.archive.originalBytes = () => { throw new Error('unexpected ZIP serialization'); };
  const edited = beginPackageTransaction(original).replacePart('/data.xml', encoder.encode('<edited/>')).commitPackage();
  expect(edited.archive.compressedBytes(edited.archive.get('unknown.xml')!).buffer).toBe(unknown.buffer);
  edited.archive.originalBytes = () => { throw new Error('unexpected ZIP serialization'); };
  const next = beginPackageTransaction(edited).replacePart('/data.xml', encoder.encode('<again/>')).commitPackage();
  const restored = openOpcPackageArchive(ZipArchive.fromSnapshot(structuredClone(next.archive.snapshot())));
  expect(restored.readPart(restored.getPart('/data.xml')!)).toEqual(encoder.encode('<again/>'));
  const exported = openOpcPackage(restored.archive.originalBytes());
  expect(exported.readPart(exported.getPart('/unknown.xml')!)).toEqual(encoder.encode('<preserve/>'));
  expect(original.readPart(original.getPart('/data.xml')!)).toEqual(encoder.encode('<original/>'));
});

test('native transactions validate and preserve added relationships and removed parts', () => {
  const original = fixture();
  const edited = beginPackageTransaction(original)
    .addPart('/extra.bin', 'application/octet-stream', new Uint8Array([1, 2, 3]))
    .addRelationship('/data.xml', { id: 'extra', type: 'urn:test', target: '/extra.bin' })
    .commitPackage();
  expect(edited.relationships(edited.getPart('/data.xml')!.name).items[0]?.id).toBe('extra');
  expect(() => beginPackageTransaction(edited).removePart('/extra.bin').commitPackage()).toThrow();
  const removed = beginPackageTransaction(edited).removeRelationship('/data.xml', 'extra').removePart('/extra.bin').commitPackage();
  const exported = openOpcPackage(removed.archive.originalBytes());
  expect(exported.getPart('/extra.bin')).toBeUndefined();
  expect(exported.getPart('/_rels/data.xml.rels')).toBeUndefined();
  expect(edited.getPart('/extra.bin')?.contentType).toBe('application/octet-stream');
});

test('native archive edits reject invalid changes without mutating their source', () => {
  const archive = fixture().archive;
  expect(() => archive.withChanges({ additions: [{ name: '../bad', data: new Uint8Array() }] })).toThrow();
  expect(() => archive.withChanges({ replacements: new Map([['missing', new Uint8Array()]]) })).toThrow();
  expect(() => archive.withChanges({ removals: new Set(['missing']) })).toThrow();
  expect(() => archive.withChanges({ replacements: new Map([['data.xml', new Uint8Array()]]), removals: new Set(['data.xml']) })).toThrow();
  expect(archive.get('data.xml')).toBeDefined();
});
