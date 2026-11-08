import { expect, test } from 'bun:test';
import { openSpreadsheetArtifact, readSpreadsheetDrawingObjects } from '../src/index.ts';

const bytes = new Uint8Array(await Bun.file(new URL('./fixtures/drawings.xlsx', import.meta.url)).arrayBuffer());
test('projects real XLSX pictures, text, connectors and nested group shapes without changing source', () => {
  const artifact = openSpreadsheetArtifact(bytes);
  const frames = readSpreadsheetDrawingObjects(artifact.workbook, artifact.worksheet.drawing!, artifact.worksheet);
  expect(frames.map(f => f.object.name)).toEqual(['Rectangle', 'Picture', 'Text box', 'Connector', 'Group']);
  expect(frames[0]!.object.geometry?.paths).toHaveLength(1);
  expect(frames[0]!.object.text).toBe('Shape text');
  expect(frames[1]!.object.image?.contentType).toBe('image/png');
  expect(frames[1]!.object.image?.bytes.subarray(0, 4)).toEqual(new Uint8Array([137, 80, 78, 71]));
  expect(frames[2]!.object.text).toBe('Text box content');
  expect(frames[3]!.object.geometry?.paths[0]?.d).toContain('L');
  expect(frames[4]!.object.children).toHaveLength(2);
  expect(artifact.bytes()).toEqual(bytes);
});

test('uses worksheet anchor extents and theme style references when local shape properties are absent', async () => {
  const { beginPackageTransaction } = await import('@tumblerjs/opc');
  const source = openSpreadsheetArtifact(bytes);
  const drawing = source.worksheet.drawing!;
  const xml = new TextDecoder().decode(source.workbook.package.readPart(drawing.part));
  const edited = xml.replace(/<a:xfrm>.*?<\/a:xfrm>/, '').replace(/<a:solidFill><a:srgbClr val="729fcf"\/><\/a:solidFill>/, '');
  const styled = edited.replace('</xdr:spPr>', '</xdr:spPr><xdr:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef></xdr:style>');
  const transaction = beginPackageTransaction(source.workbook.package);
  transaction.replacePart(drawing.partName, new TextEncoder().encode(styled));
  const artifact = openSpreadsheetArtifact(transaction.commit());
  const frames = readSpreadsheetDrawingObjects(artifact.workbook, artifact.worksheet.drawing!, artifact.worksheet);
  expect(frames[0]!.object.width).toBeGreaterThan(100);
  expect(frames[0]!.object.height).toBeGreaterThan(50);
  expect(frames[0]!.object.fill).not.toBe('none');
});
