import { expect, test } from 'bun:test';
import { applySpreadsheetCommand, createSpreadsheet, createSpreadsheetNativeArchive, encodeSpreadsheetNativeArchive, inspectSpreadsheet, openSpreadsheetArtifact, openSpreadsheetNativeArchive } from '../src/index.ts';
import { ZipArchive } from '@tumblerjs/opc';

test('native conversion preserves original XLSX bytes and independent resources', () => {
  const original = applySpreadsheetCommand(createSpreadsheet(), {name:'set-range',sheetId:'1',reference:'A1',values:[['Revenue',20],['Cost',5]]}).bytes();
  const imported = openSpreadsheetArtifact(original);
  const archive = createSpreadsheetNativeArchive(imported);
  expect(openSpreadsheetNativeArchive(archive).bytes()).toEqual(original);
  expect(openSpreadsheetArtifact(encodeSpreadsheetNativeArchive(archive)).bytes()).toEqual(original);
  expect([...archive.resources.values()].every(bytes => bytes.length < original.length)).toBe(true);
});

test('native value, formula, style and sheet edits never serialize ZIPs', () => {
  const original = ZipArchive.prototype.originalBytes;
  ZipArchive.prototype.originalBytes = () => {throw new Error('ZIP materialized during edit');};
  try {
    let artifact = createSpreadsheet();
    artifact = applySpreadsheetCommand(artifact,{name:'set-range',sheetId:'1',reference:'A1',values:[[10,20,'=SUM(A1:B1)'],['hello',true,null]]});
    artifact = applySpreadsheetCommand(artifact,{name:'format-cells',sheetId:'1',range:'A1:B1',patch:{text:{bold:{set:true}}}});
    artifact = applySpreadsheetCommand(artifact,{name:'add-sheet',nameValue:'Budget'});
    artifact = applySpreadsheetCommand(artifact,{name:'rename-sheet',sheetId:'2',nameValue:'Forecast'});
    artifact = applySpreadsheetCommand(artifact,{name:'move-sheet',sheetId:'2',index:0});
    artifact = openSpreadsheetArtifact(encodeSpreadsheetNativeArchive(createSpreadsheetNativeArchive(artifact)));
    expect(artifact.workbook.sheets.map(sheet=>sheet.name)).toEqual(['Forecast','Sheet1']);
    expect(inspectSpreadsheet(artifact,'1').cells.find(cell=>cell.reference==='C1')?.formatted).toBe('30');
    expect(artifact.selectSheet(1).worksheet.cellStyle('A1').font.bold).toBe(true);
  } finally { ZipArchive.prototype.originalBytes = original; }
});

test('range edits, formula sources and data types survive native and XLSX export', () => {
  let artifact = applySpreadsheetCommand(createSpreadsheet(),{name:'set-range',sheetId:'1',reference:'B3',values:[[0,false,'  words  ','=B3+2'],[3.5,true,null,'<>&']]});
  artifact = openSpreadsheetArtifact(encodeSpreadsheetNativeArchive(createSpreadsheetNativeArchive(artifact)));
  artifact = openSpreadsheetArtifact(artifact.bytes());
  expect(inspectSpreadsheet(artifact,'1','B3:E4').cells.map(cell=>[cell.reference,cell.formula??cell.value])).toEqual([['B3',0],['C3',false],['D3','  words  '],['E3','B3+2'],['B4',3.5],['C4',true],['E4','<>&']]);
  expect(artifact.calculation.displayText('E3')).toBe('2');
});

test('clear full-sheet ranges only visits populated cells and preserves formatting', () => {
  let artifact=applySpreadsheetCommand(createSpreadsheet(),{name:'set-range',sheetId:'1',reference:'A1',values:[[2,'=A1*2']]});
  artifact=applySpreadsheetCommand(artifact,{name:'format-cells',sheetId:'1',range:'B1',patch:{text:{italic:{set:true}}}});
  artifact=applySpreadsheetCommand(artifact,{name:'clear-range',sheetId:'1',range:'A1:XFD1048576'});
  expect(artifact.worksheet.cell('A1')?.value.type).toBe('blank');
  expect(artifact.worksheet.cell('B1')?.formula).toBeUndefined();
  expect(artifact.worksheet.cellStyle('B1').font.italic).toBe(true);
});

test('sheet operations reject invalid names, missing targets and removing the final sheet', () => {
  const artifact=createSpreadsheet();
  expect(()=>applySpreadsheetCommand(artifact,{name:'rename-sheet',sheetId:'1',nameValue:'bad/name'})).toThrow();
  expect(()=>applySpreadsheetCommand(artifact,{name:'delete-sheet',sheetId:'1'})).toThrow();
  expect(()=>applySpreadsheetCommand(artifact,{name:'set-cell',sheetId:'missing',reference:'A1',value:1})).toThrow();
  expect(()=>applySpreadsheetCommand(artifact,{name:'set-range',sheetId:'1',reference:'XFD1048576',values:[[1,2]]})).toThrow();
  expect(artifact.worksheet.rows).toHaveLength(0);
});

test('batch validation is atomic for immutable workbook values', () => {
  const artifact=createSpreadsheet();
  expect(()=>applySpreadsheetCommand(artifact,{name:'batch',commands:[{name:'set-cell',sheetId:'1',reference:'A1',value:'before'},{name:'set-formula',sheetId:'1',reference:'B1',formula:'SUM('}]})).toThrow();
  expect(artifact.worksheet.cell('A1')).toBeUndefined();
});

test('native framing rejects truncated resources and trailing data', () => {
  const native=encodeSpreadsheetNativeArchive(createSpreadsheetNativeArchive(createSpreadsheet()));
  expect(()=>openSpreadsheetArtifact(native.subarray(0,native.length-1))).toThrow();
  const extra=new Uint8Array(native.length+1);extra.set(native);
  expect(()=>openSpreadsheetArtifact(extra)).toThrow();
});

test('renaming sheets rewrites cross-sheet formulas and keeps string literals intact', () => {
  let artifact=applySpreadsheetCommand(createSpreadsheet(),{name:'add-sheet',nameValue:'Budget'});
  artifact=applySpreadsheetCommand(artifact,{name:'set-cell',sheetId:'2',reference:'A1',value:12});
  artifact=applySpreadsheetCommand(artifact,{name:'set-formula',sheetId:'1',reference:'A1',formula:'Budget!A1+SUM(Budget!A1:A2)'});
  artifact=applySpreadsheetCommand(artifact,{name:'set-formula',sheetId:'1',reference:'B1',formula:'"Budget!A1"'});
  artifact=applySpreadsheetCommand(artifact,{name:'rename-sheet',sheetId:'2',nameValue:"Next year's budget"});
  expect(artifact.worksheet.cell('A1')?.formula).toBe("'Next year''s budget'!A1+SUM('Next year''s budget'!A1:A2)");
  expect(artifact.calculation.displayText('A1')).toBe('24');
  expect(artifact.worksheet.cell('B1')?.formula).toBe('"Budget!A1"');
  artifact=openSpreadsheetArtifact(artifact.bytes());
  expect(artifact.calculation.displayText('A1')).toBe('24');
});

test('deleting referenced sheets writes REF errors and preserves unrelated formulas', () => {
  let artifact=applySpreadsheetCommand(createSpreadsheet(),{name:'add-sheet',nameValue:'Budget'});
  artifact=applySpreadsheetCommand(artifact,{name:'set-formula',sheetId:'1',reference:'A1',formula:'SUM(Budget!A1:A2)+1'});
  artifact=applySpreadsheetCommand(artifact,{name:'delete-sheet',sheetId:'2'});
  expect(artifact.worksheet.cell('A1')?.formula).toBe('SUM(#REF!)+1');
  expect(artifact.calculation.displayText('A1')).toBe('#REF!');
});

test('sheet movement and deletion retain local named-range ownership and local namespaces', async () => {
  const {beginPackageTransaction}=await import('@tumblerjs/opc');
  let artifact=applySpreadsheetCommand(createSpreadsheet(),{name:'add-sheet',nameValue:'Budget'});
  const transaction=beginPackageTransaction(artifact.workbook.package);
  const xml=artifact.workbook.document.source.replace('<sheets>','<sheets xmlns:local="urn:keep">').replace('</sheets>','</sheets><definedNames><definedName name="Local" localSheetId="1">Budget!$A$1</definedName></definedNames>');
  transaction.replacePart(artifact.workbook.part.name,new TextEncoder().encode(xml));
  artifact=openSpreadsheetArtifact(transaction.commitPackage().archive.originalBytes());
  artifact=applySpreadsheetCommand(artifact,{name:'move-sheet',sheetId:'2',index:0});
  expect(artifact.workbook.document.source).toContain('xmlns:local="urn:keep"');
  expect(artifact.workbook.document.source).toContain('localSheetId="0"');
  artifact=applySpreadsheetCommand(artifact,{name:'delete-sheet',sheetId:'2'});
  expect(artifact.workbook.document.source).not.toContain('name="Local"');
});
