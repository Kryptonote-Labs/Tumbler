import { expect, test } from 'bun:test';
import { applySpreadsheetCommand, createSpreadsheet, openSpreadsheetArtifact, readSpreadsheetDrawingObjects } from '../src/index.ts';

const source = new Uint8Array(await Bun.file(new URL('./fixtures/drawings.xlsx', import.meta.url)).arrayBuffer());
test('authors and saves a shape and picture in a workbook with no drawing', () => {
  let artifact = createSpreadsheet();
  const sheetId = String(artifact.activeSheet.sheetId);
  artifact = applySpreadsheetCommand(artifact, { name: 'insert-shape', sheetId, x: 20, y: 30, width: 120, height: 80, preset: 'ellipse', text: 'Hello' });
  const fixture=openSpreadsheetArtifact(source);
  const image=readSpreadsheetDrawingObjects(fixture.workbook,fixture.worksheet.drawing!,fixture.worksheet)[1]!.object.image!;
  artifact = applySpreadsheetCommand(artifact, { name: 'insert-image', sheetId, x: 200, y: 30, width: 60, height: 60, contentType: 'image/png', data: Buffer.from(image.bytes).toString('base64') });
  const reopened = openSpreadsheetArtifact(artifact.bytes());
  const objects = readSpreadsheetDrawingObjects(reopened.workbook, reopened.worksheet.drawing!, reopened.worksheet);
  expect(objects).toHaveLength(2);
  expect(objects[0]!.object.text).toBe('Hello');
  expect(objects[1]!.object.image?.bytes).toEqual(image.bytes);
});

test('moves, duplicates, reorders and deletes imported objects while preserving unrelated parts', () => {
  let artifact = openSpreadsheetArtifact(source);
  const drawing = artifact.worksheet.drawing!;
  const media = artifact.workbook.package.parts.find(p => p.name.value.startsWith('/xl/media/'))!;
  const mediaBytes = artifact.workbook.package.readPart(media);
  artifact = applySpreadsheetCommand(artifact, { name: 'move-drawing', sheetId: '1', objectId: 0, x: 40, y: 60, width: 100, height: 80 });
  expect(artifact.worksheet.drawing!.anchors[0]).toMatchObject({ kind: 'absolute', xEmu: 381000, yEmu: 571500 });
  artifact = applySpreadsheetCommand(artifact, { name: 'duplicate-drawing', sheetId: '1', objectId: 0 });
  expect(artifact.worksheet.drawing!.anchors).toHaveLength(6);
  const id = readSpreadsheetDrawingObjects(artifact.workbook,artifact.worksheet.drawing!,artifact.worksheet)[1]!.object.objectId;
  artifact = applySpreadsheetCommand(artifact, { name: 'order-drawing', sheetId: '1', objectId: id, action: 'front' });
  const last = artifact.worksheet.drawing!.anchors.at(-1)!;
  artifact = applySpreadsheetCommand(artifact, { name: 'delete-drawing', sheetId: '1', objectId: id });
  expect(artifact.worksheet.drawing!.anchors).toHaveLength(5);
  expect(artifact.workbook.package.readPart(artifact.workbook.package.getPart(media.name)!)).toEqual(mediaBytes);
});

test('stable object IDs allow multiple imported drawings to move in one batch', () => {
  const artifact = applySpreadsheetCommand(openSpreadsheetArtifact(source), { name: 'batch', commands: [
    { name:'move-drawing',sheetId:'1',objectId:0,x:10,y:20,width:100,height:80 },
    { name:'move-drawing',sheetId:'1',objectId:1,x:200,y:20,width:80,height:80 },
    { name:'style-drawing',sheetId:'1',objectId:0,fill:'#123456',stroke:'#654321',strokeWidth:2 },
  ]});
  const objects = readSpreadsheetDrawingObjects(artifact.workbook,artifact.worksheet.drawing!,artifact.worksheet);
  expect(objects[0]!.object.fill).toBe('rgba(18,52,86,1)');
  expect(objects[0]!.object.strokeWidth).toBe(2);
  expect(artifact.worksheet.drawing!.anchors[1]).toMatchObject({kind:'absolute',xEmu:1905000});
});


test('style edits retain imported arrowheads, dash and extension namespaces', async () => {
  const {beginPackageTransaction}=await import('@tumblerjs/opc');
  const original=openSpreadsheetArtifact(source),drawing=original.worksheet.drawing!;
  const xml=drawing.document.source.replace('<a:ln w="0">','<a:ln w="0" cap="rnd" xmlns:test="urn:line-test">').replace('</a:ln>','<a:prstDash val="dash"/><a:headEnd type="triangle"/><a:extLst><a:ext uri="test"><test:payload/></a:ext></a:extLst></a:ln>');
  const transaction=beginPackageTransaction(original.workbook.package);transaction.replacePart(drawing.partName,new TextEncoder().encode(xml));
  const artifact=applySpreadsheetCommand(openSpreadsheetArtifact(transaction.commit()),{name:'style-drawing',sheetId:'1',objectId:0,stroke:'#123456'});
  const output=artifact.worksheet.drawing!.document.source;
  expect(output).toContain('cap="rnd"');expect(output).toContain('xmlns:test="urn:line-test"');expect(output).toContain('type="triangle"');expect(output).toContain('val="dash"');
});
