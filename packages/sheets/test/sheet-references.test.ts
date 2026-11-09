import { expect, test } from 'bun:test';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { applySpreadsheetCommand, createSpreadsheet, openSpreadsheetArtifact } from '../src/index.ts';
import { rewriteFormulaSheetReferences } from '../src/sheet-references.ts';

const order = ['Sheet1', 'Budget', 'Sheet3'];

test('sheet renames rewrite both 3D endpoints with quoted and unquoted names', () => {
  for (const formula of ['SUM(Sheet1:Sheet3!A1)', "SUM('Sheet1:Sheet3'!A1)", "SUM('Sheet1':'Sheet3'!A1)"]) {
    expect(rewriteFormulaSheetReferences(formula, 'Sheet1', 'First sheet')).toBe("SUM('First sheet:Sheet3'!A1)");
    expect(rewriteFormulaSheetReferences(formula, 'Sheet3', "Last year's sheet")).toBe("SUM('Sheet1:Last year''s sheet'!A1)");
  }
  expect(rewriteFormulaSheetReferences("'O''Brien:Sheet3'!$A$1", "O'Brien", 'Budget')).toBe("'Budget:Sheet3'!$A$1");
});

test('sheet deletions consume full row, column, cell, named and spilled references', () => {
  for (const reference of ['A:A', '$A:$XFD', '1:1048576', '$1:$4', '$A$1:$XFD$1048576', 'NamedRange', 'A1#', '#REF!']) {
    expect(rewriteFormulaSheetReferences(`SUM(Budget!${reference})`, 'Budget', null, order)).toBe('SUM(#REF!)');
  }
  expect(rewriteFormulaSheetReferences('SUM(Sheet1:Sheet3!A:A)', 'Sheet1', null, order)).toBe("SUM('Budget:Sheet3'!A:A)");
  expect(rewriteFormulaSheetReferences('SUM(Sheet1:Sheet3!1:4)', 'Sheet3', null, order)).toBe("SUM('Sheet1:Budget'!1:4)");
  expect(rewriteFormulaSheetReferences('SUM(Sheet1:Budget!A1)', 'Sheet1', null, order)).toBe("SUM('Budget'!A1)");
  expect(rewriteFormulaSheetReferences('SUM(Sheet3:Sheet1!A1)', 'Sheet3', null, order)).toBe("SUM('Budget:Sheet1'!A1)");
});

test('sheet reference changes leave strings, structured columns and external workbooks intact', () => {
  const formula = 'SUM([Book.xlsx]Budget!A1,\'[Book.xlsx]Budget\'!A:A,Table1[Budget!A1],"Budget!A1","quoted ""Budget!A1""")';
  expect(rewriteFormulaSheetReferences(formula,'Budget','Forecast')).toBe(formula);
  expect(rewriteFormulaSheetReferences(formula,'Budget',null,order)).toBe(formula);
});

test('renaming and deleting a sheet updates imported table calculated and totals formulas', () => {
  let artifact = applySpreadsheetCommand(createSpreadsheet(), {name:'add-sheet', nameValue:'Budget'});
  artifact = applySpreadsheetCommand(artifact, {name:'set-range', sheetId:'1', reference:'A1', values:[['Input','Total'],[2,'=Budget!A1']]});
  artifact = applySpreadsheetCommand(artifact, {name:'set-cell', sheetId:'2', reference:'A1', value:8});
  const ns = artifact.workbook.document.root.namespaceUri;
  const transaction = beginPackageTransaction(artifact.workbook.package);
  transaction.addPart('/xl/tables/table1.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml',new TextEncoder().encode(`<table xmlns="${ns}" id="1" name="Table1" displayName="Table1" ref="A1:B2"><tableColumns count="2"><tableColumn id="1" name="Input"/><tableColumn id="2" name="Total"><calculatedColumnFormula>Budget!A1</calculatedColumnFormula><totalsRowFormula>SUM(Budget!A:A,Budget!1:4)</totalsRowFormula></tableColumn></tableColumns></table>`));
  transaction.addRelationship(artifact.activeSheet.partName, {id:'rIdTable',type:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/table',target:'/xl/tables/table1.xml'});
  const sheet = artifact.worksheet.document;
  transaction.replacePart(artifact.activeSheet.partName,new TextEncoder().encode(sheet.source.replace('</worksheet>','<tableParts count="1"><tablePart xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdTable"/></tableParts></worksheet>')));
  artifact = openSpreadsheetArtifact(transaction.commitPackage().archive.originalBytes());
  expect(artifact.worksheet.tables).toHaveLength(1);
  artifact = applySpreadsheetCommand(artifact,{name:'rename-sheet',sheetId:'2',nameValue:'Forecast'});
  let table = new TextDecoder().decode(artifact.workbook.package.readPart(artifact.workbook.package.getPart('/xl/tables/table1.xml')!));
  expect(table).toContain("<calculatedColumnFormula>'Forecast'!A1</calculatedColumnFormula>");
  expect(table).toContain("<totalsRowFormula>SUM('Forecast'!A:A,'Forecast'!1:4)</totalsRowFormula>");
  expect(artifact.worksheet.cell('B2')?.formula).toBe("'Forecast'!A1");
  artifact = applySpreadsheetCommand(artifact,{name:'delete-sheet',sheetId:'2'});
  artifact = openSpreadsheetArtifact(artifact.bytes());
  table = new TextDecoder().decode(artifact.workbook.package.readPart(artifact.workbook.package.getPart('/xl/tables/table1.xml')!));
  expect(table).toContain('<calculatedColumnFormula>#REF!</calculatedColumnFormula>');
  expect(table).toContain('<totalsRowFormula>SUM(#REF!,#REF!)</totalsRowFormula>');
  expect(artifact.worksheet.cell('B2')?.formula).toBe('#REF!');
});

test('imported 3D references shrink deleted endpoints using the workbook sheet order', () => {
  let artifact = applySpreadsheetCommand(createSpreadsheet(),{name:'batch',commands:[{name:'add-sheet',nameValue:'Budget'},{name:'add-sheet',nameValue:'Sheet3'}]});
  const transaction = beginPackageTransaction(artifact.workbook.package);
  transaction.replacePart(artifact.workbook.sheets[2]!.partName,new TextEncoder().encode(`<worksheet xmlns="${artifact.workbook.document.root.namespaceUri}"><sheetData><row r="1"><c r="A1"><f>SUM(Sheet1:Sheet3!A:A)</f><v>9</v></c></row></sheetData></worksheet>`));
  artifact = openSpreadsheetArtifact(transaction.commitPackage().archive.originalBytes());
  artifact = applySpreadsheetCommand(artifact,{name:'rename-sheet',sheetId:'1',nameValue:'First sheet'});
  expect(artifact.selectSheet(3).worksheet.cell('A1')?.formula).toBe("SUM('First sheet:Sheet3'!A:A)");
  artifact = applySpreadsheetCommand(artifact,{name:'delete-sheet',sheetId:'1'});
  expect(artifact.selectSheet(3).worksheet.cell('A1')?.formula).toBe("SUM('Budget:Sheet3'!A:A)");
  artifact = openSpreadsheetArtifact(artifact.bytes());
  expect(artifact.selectSheet(3).worksheet.cell('A1')?.formula).toBe("SUM('Budget:Sheet3'!A:A)");
});
