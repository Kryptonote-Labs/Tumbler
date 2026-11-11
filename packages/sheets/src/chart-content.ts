import { readChartContent, type ChartContent } from '@tumblerjs/charts';
import { refreshChartWorkbook } from './chart-workbook.ts';
import type { SpreadsheetArtifact } from './artifact.ts';
import { spreadsheetDrawingObjectId } from './drawings.ts';

export function spreadsheetChartContent(artifact: SpreadsheetArtifact, objectId: number, sheetId?: string): ChartContent {
  const target = sheetId ? artifact.selectSheet(sheetId) : artifact;
  const drawing = target.worksheet.drawing;
  const frame = drawing?.charts.find(frame => spreadsheetDrawingObjectId(drawing, frame.anchor) === objectId);
  if (!frame?.partName) throw new TypeError('Select an editable chart.');
  const content = readChartContent(artifact.workbook.package, frame.partName);
  return { ...content, xml: new TextDecoder().decode(refreshChartWorkbook(new TextEncoder().encode(content.xml), target)) };
}
