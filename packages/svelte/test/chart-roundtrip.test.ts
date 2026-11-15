import { expect, test } from 'bun:test';
import {
  OOXML_CHART_TYPES,
  createOoxmlChart,
  chartBytesToBase64,
  readChartContent,
  readChartData,
  updateChartTitle,
} from '@tumblerjs/charts';
import {
  createChartWorkbook,
  createSpreadsheet,
  applySpreadsheetCommand,
  openSpreadsheetArtifact,
  spreadsheetChartContent,
  spreadsheetDrawingObjectId,
} from '@tumblerjs/sheets';
import { createWordArtifact, openWordArtifact } from '@tumblerjs/word';
import {
  createPresentation,
  applyPresentationCommand,
  openPresentationArtifact,
  presentationChartContent,
} from '@tumblerjs/slides';

// Native package preservation, not a claim of rendering or Microsoft Office interoperability.
for (const type of OOXML_CHART_TYPES)
  test(`${type} retains chart data through DOCX, PPTX and XLSX export and reopen`, () => {
    const source = createOoxmlChart({
      type,
      categories: ['A', 'B'],
      series: [
        { name: 'Open', values: [3, 4], xValues: [1, 2], bubbleSizes: [2, 3] },
        { name: 'High', values: [8, 9], xValues: [1, 2], bubbleSizes: [2, 3] },
        { name: 'Low', values: [1, 2], xValues: [1, 2], bubbleSizes: [2, 3] },
        { name: 'Close', values: [5, 6], xValues: [1, 2], bubbleSizes: [2, 3] },
      ],
    });
    const embedded = createChartWorkbook(updateChartTitle(source, 'Revenue'));
    const content = {
      xml: new TextDecoder().decode(embedded.source),
      workbook: chartBytesToBase64(embedded.artifact.bytes()),
    };
    const word = openWordArtifact(
      createWordArtifact({
        paragraphs: [{ runs: [{ text: '\uFFFC', chart: { width: 360, height: 240, content } }] }],
      }).bytes(),
    );
    const drawing = [...word.document.drawings.values()].find(
      (drawing) => drawing.kind === 'chart',
    );
    if (!drawing || drawing.kind !== 'chart') throw Error('Word chart is missing');
    const wordContent = readChartContent(word.document.package, drawing.partName);
    let slides = createPresentation();
    const slideId = slides.document.slides[0]!.id;
    slides = applyPresentationCommand(slides, {
      name: 'insert-chart',
      slideId,
      bounds: { x: 40, y: 40, width: 480, height: 320 },
      content,
    });
    const reopened = openPresentationArtifact(slides.bytes());
    const object = reopened.document.slides[0]!.objects.find((object) => object.kind === 'chart')!;
    const slideContent = presentationChartContent(reopened.document, slideId, object.key);
    let sheet = createSpreadsheet();
    sheet = applySpreadsheetCommand(sheet, {
      name: 'insert-chart',
      sheetId: '1',
      x: 40,
      y: 40,
      width: 480,
      height: 320,
      content: { xml: new TextDecoder().decode(source) },
      bindUnboundData: true,
    });
    sheet = openSpreadsheetArtifact(sheet.bytes());
    const sheetDrawing = sheet.worksheet.drawing!;
    const sheetContent = spreadsheetChartContent(
      sheet,
      spreadsheetDrawingObjectId(sheetDrawing, sheetDrawing.charts[0]!.anchor)!,
    );
    for (const retained of [wordContent, slideContent, sheetContent]) {
      expect(readChartData(new TextEncoder().encode(retained.xml))[0]).toMatchObject({
        type,
        series: [
          { name: 'Open', values: { values: [3, 4] } },
          { name: 'High', values: { values: [8, 9] } },
          { name: 'Low', values: { values: [1, 2] } },
          { name: 'Close', values: { values: [5, 6] } },
        ],
      });
    }
  });
