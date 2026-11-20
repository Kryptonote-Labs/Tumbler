import { expect, test } from 'bun:test';
import { createMathEditor, emptyEquation, typeMathText } from '@tumblerjs/core/math';
import { beginPackageTransaction, saveOpcPackage } from '@tumblerjs/opc';
import {
  applySpreadsheetCommand,
  createSpreadsheet,
  openSpreadsheetArtifact,
  readSpreadsheetDrawingObjects,
  type SpreadsheetArtifact,
} from '../src/index.ts';

const equation = typeMathText(createMathEditor(emptyEquation), 'x^2+1/n').equation;
const edited = typeMathText(createMathEditor(emptyEquation), 'a+b').equation;

const objects = (artifact: SpreadsheetArtifact) =>
  readSpreadsheetDrawingObjects(artifact.workbook, artifact.worksheet.drawing!, artifact.worksheet);
const drawingXml = (artifact: SpreadsheetArtifact) =>
  new TextDecoder().decode(artifact.workbook.package.readPart(artifact.worksheet.drawing!.part));

test('an inserted equation saves as Excel Office Math, keeps its place and leaves cells calculating', () => {
  let artifact = createSpreadsheet();
  const sheetId = String(artifact.activeSheet.sheetId);
  artifact = applySpreadsheetCommand(artifact, { name: 'set-cell', sheetId, reference: 'A1', value: 2 });
  artifact = artifact.editFormula('B1', 'A1*3');
  artifact = applySpreadsheetCommand(artifact, { name: 'insert-equation', sheetId, x: 120, y: 40, width: 200, height: 60, equation });
  const objectId = objects(artifact)[0]!.object.objectId;
  artifact = applySpreadsheetCommand(artifact, { name: 'edit-equation', sheetId, objectId, equation: edited, width: 90, height: 30 });
  artifact = applySpreadsheetCommand(artifact, { name: 'move-drawing', sheetId, objectId, x: 150, y: 60, width: 90, height: 30 });

  const reopened = openSpreadsheetArtifact(artifact.bytes());
  const [frame] = objects(reopened);
  expect(frame!.object.equation?.math).toEqual(edited);
  expect(frame!.object.text).toBe('');
  expect(frame!.anchor).toMatchObject({ kind: 'absolute', xEmu: 150 * 9525, yEmu: 60 * 9525, widthEmu: 90 * 9525, heightEmu: 30 * 9525 });
  const xml = drawingXml(reopened);
  expect(xml).toMatch(/<mc:AlternateContent[^>]*><mc:Choice Requires="a14"><xdr:sp[ >][^]*<a14:m [^>]*><m:oMathPara [^>]*><m:oMath>/);
  expect(xml).toMatch(/<m:r><a:rPr[^>]*><a:latin typeface="Cambria Math"\/>/);
  // Readers without a14 see the linear format.
  expect(xml).toMatch(/<mc:Fallback[^>]*><xdr:sp[ >][^]*<a:t>a\+b<\/a:t>[^]*<\/mc:Fallback>/);
  expect(reopened.worksheet.cell('B1')).toMatchObject({ formula: 'A1*3' });
  expect(reopened.calculation.value('B1')).toMatchObject({ type: 'number', value: 6 });
});

test('an imported Excel equation edits in place, keeping its anchor and display layout', () => {
  let artifact = createSpreadsheet();
  const sheetId = String(artifact.activeSheet.sheetId);
  artifact = applySpreadsheetCommand(artifact, { name: 'insert-shape', sheetId, x: 0, y: 0, width: 10, height: 10, preset: 'rect' });
  // As Excel writes Insert > Equation: a two-cell anchored text box with a centred math paragraph.
  const excel = `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>4</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" Requires="a14"><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="2" name="TextBox 1"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr><xdr:txBody><a:bodyPr wrap="none"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p><a14:m><m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMathParaPr><m:jc m:val="left"/></m:oMathParaPr><m:oMath><m:r><a:rPr lang="en-US" sz="1400" i="1"><a:latin typeface="Cambria Math"/></a:rPr><m:t>y</m:t></m:r></m:oMath></m:oMathPara></a14:m></a:p></xdr:txBody></xdr:sp></mc:Choice><mc:Fallback><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="2" name="TextBox 1"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr/><xdr:txBody><a:bodyPr/><a:p><a:r><a:t>y</a:t></a:r></a:p></xdr:txBody></xdr:sp></mc:Fallback></mc:AlternateContent><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
  const transaction = beginPackageTransaction(artifact.workbook.package);
  transaction.replacePart(artifact.worksheet.drawing!.partName, new TextEncoder().encode(excel));
  artifact = openSpreadsheetArtifact(saveOpcPackage(transaction.commitPackage()));

  const [imported] = objects(artifact);
  expect(imported!.object.equation).toMatchObject({ display: true, size: 14 * (96 / 72) });
  artifact = applySpreadsheetCommand(artifact, { name: 'edit-equation', sheetId, objectId: 2, equation: edited });
  const xml = drawingXml(openSpreadsheetArtifact(artifact.bytes()));
  expect(xml).toContain('<xdr:twoCellAnchor><xdr:from><xdr:col>2</xdr:col>');
  expect(xml).toContain('<m:oMathParaPr><m:jc m:val="left"/></m:oMathParaPr>');
  expect(xml).toMatch(/<m:r><a:rPr lang="en-US" sz="1400" i="1">/);
  expect(xml).toMatch(/<mc:Fallback[^>]*>[^]*<a:t>a\+b<\/a:t>/);
  expect(objects(artifact)[0]!.object.equation?.math).toEqual(edited);
});
