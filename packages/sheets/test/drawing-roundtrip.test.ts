import { expect, test } from 'bun:test';
import { openOpcPackage } from '@tumblerjs/opc';
import { applySpreadsheetCommand, openSpreadsheetArtifact, createSpreadsheetNativeArchive, openSpreadsheetNativeArchive } from '../src/index.ts';

// LibreOffice exported this fixture from drawings.fods. It contains a picture,
// text box, connector, rectangle and group with two children.
const source = new Uint8Array(await Bun.file(new URL('./fixtures/drawings.xlsx', import.meta.url)).arrayBuffer());

test('untouched drawings survive cell editing, native storage and XLSX download byte for byte', () => {
  const original = openOpcPackage(source);
  let artifact = openSpreadsheetArtifact(source);
  expect(artifact.worksheet.drawing?.anchors).toHaveLength(5);
  artifact = applySpreadsheetCommand(artifact, { name: 'set-cell', sheetId: '1', reference: 'A1', value: 'Edited cell' });
  artifact = openSpreadsheetNativeArchive(createSpreadsheetNativeArchive(artifact));
  const saved = openOpcPackage(artifact.bytes());
  const drawingParts = original.parts.filter(part => /\/(drawings|media)\//.test(part.name.value));
  expect(drawingParts.length).toBeGreaterThanOrEqual(3);
  for (const part of drawingParts) {
    const after = saved.getPart(part.name);
    expect(after, part.name.value).toBeDefined();
    expect(saved.readPart(after!), part.name.value).toEqual(original.readPart(part));
  }
  expect(openSpreadsheetArtifact(artifact.bytes()).worksheet.cell('A1')?.value).toMatchObject({ value: 'Edited cell' });
});

test('opening and downloading an unedited workbook preserves the entire XLSX', () => {
  expect(openSpreadsheetArtifact(source).bytes()).toEqual(source);
});
