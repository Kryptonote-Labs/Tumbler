import { readChartContent, type ChartContent } from '@tumblerjs/charts';
import { refreshChartWorkbook } from './chart-workbook.ts';
import type { SpreadsheetArtifact } from './artifact.ts';
import { spreadsheetDrawingObjectId } from './drawings.ts';

export function spreadsheetChartContent(artifact: SpreadsheetArtifact, objectId: number, sheetId?: string): ChartContent {
  const sheet = sheetId === undefined ? undefined : artifact.workbook.sheets.find(sheet => String(sheet.sheetId) === sheetId || sheet.name === sheetId);
  if (sheetId !== undefined && !sheet) throw new Error('Worksheet does not exist.');
  const target = sheet ? artifact.selectSheet(sheet.sheetId) : artifact;
  const drawing = target.worksheet.drawing;
  const frame = drawing?.charts.find(frame => spreadsheetDrawingObjectId(drawing, frame.anchor) === objectId);
  if (!frame?.partName) throw new TypeError('Select an editable chart.');
  const content = readChartContent(artifact.workbook.package, frame.partName);
  try { return { ...content, xml: new TextDecoder().decode(refreshChartWorkbook(new TextEncoder().encode(content.xml), target)) }; } catch {
    // Keep the native source available for inspection and repair when caches are malformed.
    return content;
  }
}
