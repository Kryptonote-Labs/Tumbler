import { expect, test } from 'bun:test';
import { createSpreadsheet, applySpreadsheetCommand } from '../src/commands.ts';
import { applySpreadsheetLayoutCommand as layout } from '../src/layout.ts';
import { openSpreadsheetArtifact } from '../src/artifact.ts';

test('column width edits split existing intervals and preserve unaffected widths', () => {
  let artifact = layout(createSpreadsheet(), {name:'set-column-width',sheetId:'1',first:1,last:10,width:12});
  artifact = layout(artifact,{name:'set-column-width',sheetId:'1',first:3,last:5,width:20});
  expect(artifact.worksheet.columns.map(c=>[c.min,c.max,c.width])).toEqual([[1,2,12],[3,5,20],[6,10,12]]);
  artifact = layout(artifact,{name:'set-column-width',sheetId:'1',first:2,last:12,width:15});
  expect(artifact.worksheet.columns.map(c=>[c.min,c.max,c.width])).toEqual([[1,1,12],[2,2,15],[3,5,15],[6,10,15],[11,12,15]]);
  expect(openSpreadsheetArtifact(artifact.bytes()).worksheet.columns).toEqual(artifact.worksheet.columns);
});

test('row height edits retain values and insert blank rows in order', () => {
  let artifact = applySpreadsheetCommand(createSpreadsheet(),{name:'set-cell',sheetId:'1',reference:'A2',value:'preserved'});
  artifact = layout(artifact,{name:'set-row-height',sheetId:'1',first:1,last:3,height:30});
  expect(artifact.worksheet.rows.map(r=>[r.index,r.height])).toEqual([[1,30],[2,30],[3,30]]);
  expect(artifact.worksheet.cell('A2')?.value).toMatchObject({value:'preserved'});
  expect(openSpreadsheetArtifact(artifact.bytes()).worksheet.rows[1]?.height).toBe(30);
});

test('merges cannot silently hide populated cells and unmerge keeps the anchor', () => {
  let artifact = applySpreadsheetCommand(createSpreadsheet(),{name:'set-cell',sheetId:'1',reference:'A1',value:'Title'});
  const occupied = applySpreadsheetCommand(artifact,{name:'set-cell',sheetId:'1',reference:'B1',value:2});
  expect(()=>layout(occupied,{name:'merge-cells',sheetId:'1',range:'A1:C1'})).toThrow('Clear the other cells');
  artifact = layout(artifact,{name:'merge-cells',sheetId:'1',range:'A1:C1'});
  expect(artifact.worksheet.merges).toHaveLength(1);
  expect(()=>layout(artifact,{name:'merge-cells',sheetId:'1',range:'B1:D1'})).toThrow('Unmerge');
  artifact = layout(openSpreadsheetArtifact(artifact.bytes()),{name:'unmerge-cells',sheetId:'1',range:'B1:B1'});
  expect(artifact.worksheet.merges).toHaveLength(0);
  expect(artifact.worksheet.cell('A1')?.value).toMatchObject({value:'Title'});
});

test('freeze panes can be added, replaced and removed through an XLSX roundtrip', () => {
  let artifact = layout(createSpreadsheet(),{name:'freeze-panes',sheetId:'1',rows:1,columns:2});
  expect(artifact.worksheet.panes[0]).toMatchObject({xSplit:2,ySplit:1,state:'frozen',topLeftCell:{row:2,column:3}});
  artifact = layout(openSpreadsheetArtifact(artifact.bytes()),{name:'freeze-panes',sheetId:'1',rows:3,columns:0});
  expect(artifact.worksheet.panes[0]).toMatchObject({xSplit:0,ySplit:3});
  artifact = layout(artifact,{name:'freeze-panes',sheetId:'1',rows:0,columns:0});
  expect(openSpreadsheetArtifact(artifact.bytes()).worksheet.panes).toHaveLength(0);
});
