import { expect, test } from 'bun:test';
import { ZipArchive, openZipArchive } from '../src/zip/archive.ts';
import { buildStoredZip } from './zip-builder.ts';

for (const compressionMethod of [0, 8]) {
  test(`member snapshots retain unknown ZIP headers, directories and comments, method ${compressionMethod}`, () => {
    const original = buildStoredZip([
      { name: 'folder/', compressionMethod },
      { name: 'folder/中文.xml', data: new TextEncoder().encode('<unknown> untouched </unknown>'), compressionMethod },
    ], { comment: 'preserved archive comment' });
    const view = new DataView(original.buffer);
    const eocd = original.length - 22 - 'preserved archive comment'.length;
    let central = view.getUint32(eocd + 16, true);
    for (let i = 0; i < 2; i++) {
      // Metadata unknown to the OPC semantic model must not disappear in native storage.
      view.setUint16(central + 12, 0x1234, true);
      view.setUint16(central + 14, 0x5678, true);
      view.setUint32(central + 38, 0x81a40000, true);
      central += 46 + view.getUint16(central + 28, true);
    }
    const archive = openZipArchive(original);
    const stored = structuredClone(archive.snapshot());
    const restored = ZipArchive.fromSnapshot(stored);
    expect(restored.originalBytes()).toEqual(original);
    expect(ZipArchive.fromSnapshot(structuredClone(restored.snapshot())).originalBytes()).toEqual(original);
    for (const entry of restored.entries)
      expect(restored.read(entry)).toEqual(archive.read(archive.get(entry.name)!));
    expect(() => ZipArchive.fromSnapshot({ ...stored, layout: [] })).toThrow();
    expect(() => ZipArchive.fromSnapshot({ ...stored, payloads: new Map() })).toThrow();
  });
}

test('empty ZIP snapshots retain their complete container', () => {
  const original = buildStoredZip([], { comment: 'empty' });
  expect(ZipArchive.fromSnapshot(openZipArchive(original).snapshot()).originalBytes()).toEqual(original);
});
