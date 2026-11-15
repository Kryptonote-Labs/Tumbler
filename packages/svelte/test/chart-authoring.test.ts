import { expect, test } from 'bun:test';
import {
  createOoxmlChart,
  readChartData,
  chartPropertyTree,
  updateChartTitle,
} from '@tumblerjs/charts';
import {
  createSpreadsheet,
  applySpreadsheetCommand,
  createSpreadsheetRangeChart,
  spreadsheetChartContent,
  spreadsheetDrawingObjectId,
  refreshChartWorkbook,
} from '@tumblerjs/sheets';
import { chartFormatTargets } from '../src/chart-properties';
import {
  chartFormatOptions,
  editChartFormatOption,
} from '../src/chart-format-options';
const encoder = new TextEncoder();
function sheet() {
  return applySpreadsheetCommand(createSpreadsheet(), {
    name: 'set-range',
    sheetId: '1',
    reference: 'A1',
    values: [
      ['Month', 'Sales'],
      ['Jan', 3],
      ['Feb', 8],
    ],
  });
}
const range = { start: { row: 1, column: 1 }, end: { row: 3, column: 2 } };

test('chart duplication creates independent chart parts and keeps live cell bindings', () => {
  let artifact = sheet();
  artifact = applySpreadsheetCommand(artifact, {
    name: 'insert-chart',
    sheetId: '1',
    x: 0,
    y: 0,
    width: 480,
    height: 320,
    content: { xml: new TextDecoder().decode(createSpreadsheetRangeChart(artifact, range)) },
  });
  const drawing = artifact.worksheet.drawing!;
  const id = spreadsheetDrawingObjectId(drawing, drawing.charts[0]!.anchor)!;
  artifact = applySpreadsheetCommand(artifact, {
    name: 'duplicate-drawing',
    sheetId: '1',
    objectId: id,
  });
  const charts = artifact.worksheet.drawing!.charts;
  expect(charts[0]!.partName).not.toEqual(charts[1]!.partName);
  const duplicate = spreadsheetDrawingObjectId(artifact.worksheet.drawing!, charts[1]!.anchor)!;
  const original = spreadsheetChartContent(artifact, id);
  artifact = applySpreadsheetCommand(artifact, {
    name: 'edit-chart',
    sheetId: '1',
    objectId: duplicate,
    content: {
      xml: new TextDecoder().decode(updateChartTitle(encoder.encode(original.xml), 'Copy')),
    },
  });
  expect(spreadsheetChartContent(artifact, id).xml).not.toContain('Copy');
  artifact = artifact.editCell('B2', 99);
  expect(
    readChartData(encoder.encode(spreadsheetChartContent(artifact, duplicate).xml))[0]!.series[0]!
      .values?.values,
  ).toEqual([99, 8]);
});

test('whole-column selections trim caches while quoted comma worksheet names stay live', () => {
  let artifact = sheet();
  artifact = applySpreadsheetCommand(artifact, {
    name: 'rename-sheet',
    sheetId: '1',
    nameValue: 'Revenue, EU',
  });
  const source = createSpreadsheetRangeChart(artifact, {
    start: { row: 1, column: 1 },
    end: { row: 1048576, column: 2 },
  });
  expect(readChartData(source)[0]!.series[0]!.values?.values).toEqual([3, 8]);
  const refreshed = refreshChartWorkbook(source, artifact.editCell('B2', 99));
  expect(readChartData(refreshed)[0]!.series[0]!.values?.values).toEqual([99, 8]);
});

test('oversized native references retain formulas and caches without dense allocation', () => {
  const source = createSpreadsheetRangeChart(sheet(), range);
  const huge = encoder.encode(
    new TextDecoder().decode(source).replaceAll('$B$2:$B$3', '$A$1:$XFD$1048576'),
  );
  expect(readChartData(refreshChartWorkbook(huge, sheet()))[0]!.series[0]!.values).toMatchObject({
    formula: "'Sheet1'!$A$1:$XFD$1048576",
    values: [3, 8],
  });
});

test('formatting creates absent axis settings, accepts decimals and preserves axis identities', () => {
  let source = createOoxmlChart({
    type: 'barChart',
    categories: ['A', 'B'],
    series: [{ name: 'Sales', values: [1, 2] }],
  });
  const axis = chartFormatTargets(chartPropertyTree(source)).find((target) =>
    target.key.startsWith('valAx:'),
  )!;
  for (const [label, value] of [
    ['Minimum', '-1.5'],
    ['Maximum', '10.5'],
    ['Number format', '£#,##0.00'],
  ] as const) {
    const option = chartFormatOptions(axis.node).find((option) => option.label === label)!;
    source = editChartFormatOption(source, axis.key, option, value);
  }
  const after = chartFormatTargets(chartPropertyTree(source)).find(
    (target) => target.key === axis.key,
  )!;
  expect(after).toBeDefined();
  expect(new TextDecoder().decode(source)).toContain('£#,##0.00');
  source = updateChartTitle(source, 'Revenue', after.node.id);
  expect(new TextDecoder().decode(source)).toContain('Revenue');
});

test('combo changes keep series bindings and independent secondary axes', async () => {
  const { changeChartSeriesType, parseOoxmlChart } = await import('@tumblerjs/charts');
  let source = createOoxmlChart({
    type: 'barChart',
    categories: ['A', 'B'],
    series: [
      { name: 'Revenue', values: [10, 20] },
      { name: 'Margin', values: [0.1, 0.2] },
    ],
  });
  source = changeChartSeriesType(source, {
    plot: 0,
    series: 1,
    type: 'lineChart',
    secondaryAxis: true,
  });
  expect(
    readChartData(source).map((plot) => [plot.type, plot.series.map((series) => series.name)]),
  ).toEqual([
    ['barChart', ['Revenue']],
    ['lineChart', ['Margin']],
  ]);
  expect(
    chartFormatTargets(chartPropertyTree(source)).filter(
      (target) => target.label === 'Secondary vertical axis',
    ),
  ).toHaveLength(1);
  expect(parseOoxmlChart(source, 'transitional').status).toBe('supported');
  source = changeChartSeriesType(source, {
    plot: 1,
    series: 0,
    type: 'lineChart',
    secondaryAxis: false,
  });
  expect(readChartData(source)[1]!.series[0]!.values?.values).toEqual([0.1, 0.2]);
  expect(
    chartFormatTargets(chartPropertyTree(source)).some(
      (target) => target.label === 'Secondary vertical axis',
    ),
  ).toBe(false);
});

test('line and text controls edit DrawingML properties without exposing its structure', () => {
  let source = createOoxmlChart({
    type: 'barChart',
    categories: ['A'],
    series: [{ name: 'Sales', values: [10] }],
  });
  const area = chartFormatTargets(chartPropertyTree(source))[0]!;
  for (const [label, value] of [
    ['Line width (pt)', '25400'],
    ['Line colour', 'FF0000'],
    ['Font size (pt)', '1400'],
    ['Bold', '1'],
    ['Text colour', '336699'],
  ] as const) {
    source = editChartFormatOption(
      source,
      area.key,
      chartFormatOptions(area.node).find((option) => option.label === label)!,
      value,
    );
  }
  expect(new TextDecoder().decode(source)).toContain('336699');
});

test('single columns, single rows and headerless tables keep every numeric value', () => {
  const artifact = applySpreadsheetCommand(createSpreadsheet(), {
    name: 'set-range',
    sheetId: '1',
    reference: 'A1',
    values: [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
  });
  expect(
    readChartData(
      createSpreadsheetRangeChart(artifact, {
        start: { row: 1, column: 1 },
        end: { row: 3, column: 1 },
      }),
    )[0]!.series[0]!.values?.values,
  ).toEqual([1, 3, 5]);
  expect(
    readChartData(
      createSpreadsheetRangeChart(artifact, {
        start: { row: 1, column: 1 },
        end: { row: 1, column: 2 },
      }),
    )[0]!.series[0]!.values?.values,
  ).toEqual([1, 2]);
  expect(
    readChartData(createSpreadsheetRangeChart(artifact, range))[0]!.series.map(
      (series) => series.values?.values,
    ),
  ).toEqual([
    [1, 3, 5],
    [2, 4, 6],
  ]);
});

test('Word chart identities survive text inserted before the chart', async () => {
  const Y = await import('yjs');
  const { inspectWordCharts } = await import('@tumblerjs/word/operations');
  const doc = new Y.Doc(),
    text = doc.getText('body');
  const xml = new TextDecoder().decode(
    createOoxmlChart({
      type: 'barChart',
      categories: ['A'],
      series: [{ name: 'Sales', values: [2] }],
    }),
  );
  text.insert(0, '\uFFFC', { chart: { width: 360, height: 240, content: { xml } } });
  const original = inspectWordCharts(text, undefined)[0]!;
  text.insert(0, 'Introduction\n');
  const moved = inspectWordCharts(text, undefined)[0]!;
  expect(moved.part).toBe(original.part);
  expect(moved.start).toBeGreaterThan(original.start);
  doc.destroy();
});

test('automatic XY margins contain rotated tick labels with host number formatting', async () => {
  const { parseOoxmlChart, layoutChartScene } = await import('@tumblerjs/charts');
  const { chartMarksBounds } =
    await import('../../charts/src/shape-scene');
  const original = parseOoxmlChart(
    createOoxmlChart({
      type: 'scatterChart',
      categories: [],
      series: [{ name: 'Sales', values: [1000, 9000], xValues: [1000, 8000] }],
    }),
    'transitional',
  );
  if (original.status !== 'supported') throw Error('Expected editable scatter chart');
  for (const rotation of [-70, -35, 35, 70]) {
    const model = {
      ...original,
      legend: undefined,
      axes: original.axes.map((axis) => ({ ...axis, textStyle: { ...axis.textStyle, rotation } })),
    };
    const scene = layoutChartScene(model, 480, 320, {
      formatNumber: (value) => `£${value.toFixed(2)}`,
    });
    const bounds = chartMarksBounds(
      { measure: (text, font) => text.length * font.size * 0.55 },
      scene.marks,
    )!;
    expect(bounds.x).toBeGreaterThanOrEqual(-0.1);
    expect(bounds.y).toBeGreaterThanOrEqual(-0.1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(480.1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(320.1);
  }
});

test('3-D numeric axis rotation retains tick anchors', async () => {
  const { parseOoxmlChart, layoutChartScene } = await import('@tumblerjs/charts');
  const original = parseOoxmlChart(
    createOoxmlChart({
      type: 'bar3DChart',
      categories: ['A', 'B'],
      series: [{ name: 'Sales', values: [3, 8] }],
    }),
    'transitional',
  );
  if (original.status !== 'supported') throw Error('Expected editable 3-D chart');
  const model = {
    ...original,
    axes: original.axes.map((axis) =>
      axis.kind === 'value' ? { ...axis, textStyle: { ...axis.textStyle, rotation: 35 } } : axis,
    ),
  };
  type Mark = import('@tumblerjs/charts').ChartMark;
  function texts(marks: readonly Mark[]): Extract<Mark, { kind: 'text' }>[] {
    return marks.flatMap((mark) =>
      mark.kind === 'group' ? texts(mark.marks) : mark.kind === 'text' ? [mark] : [],
    );
  }
  const before = texts(layoutChartScene(original, 480, 320).marks),
    after = texts(layoutChartScene(model, 480, 320).marks);
  const rotated = after.filter((mark) => mark.rotate === 35);
  expect(rotated.length).toBeGreaterThan(0);
  for (const mark of rotated)
    expect(
      before.some(
        (candidate) =>
          candidate.text === mark.text && candidate.x === mark.x && candidate.y === mark.y,
      ),
    ).toBe(true);
});

test.each(['scatterChart', 'bubbleChart'] as const)(
  '%s creation binds X, Y and size roles to existing cells',
  async (type) => {
    const { chartCreateInput, runChartCreation } =
      await import('../../cli/src/chart-create');
    const { spreadsheetCommand } = await import('@tumblerjs/sheets');
    let artifact = applySpreadsheetCommand(createSpreadsheet(), {
      name: 'set-range',
      sheetId: '1',
      reference: 'A1',
      values: [
        ['X', 'Y', 'Size'],
        [10, 3, 5],
        [20, 8, 7],
      ],
    });
    const input = chartCreateInput.parse({
      page: 'read',
      target: { family: 'spreadsheet', sheetId: '1', sourceRange: 'A1:C3' },
      chart: { type },
    });
    await runChartCreation('document', input, {
      operateSpreadsheet: async (_document, input) => {
        artifact = applySpreadsheetCommand(artifact, spreadsheetCommand.parse(input.command));
        return {};
      },
    });
    const drawing = artifact.worksheet.drawing!;
    const data = readChartData(
      new TextEncoder().encode(
        spreadsheetChartContent(
          artifact,
          spreadsheetDrawingObjectId(drawing, drawing.charts[0]!.anchor)!,
        ).xml,
      ),
    )[0]!;
    expect(data.series[0]!.xValues).toMatchObject({
      formula: "'Sheet1'!$A$2:$A$3",
      values: [10, 20],
    });
    expect(data.series[0]!.values).toMatchObject({ formula: "'Sheet1'!$B$2:$B$3", values: [3, 8] });
    if (type === 'bubbleChart')
      expect(data.series[0]!.bubbleSizes).toMatchObject({
        formula: "'Sheet1'!$C$2:$C$3",
        values: [5, 7],
      });
    expect(artifact.worksheet.cell('D1')).toBeUndefined();
  },
);
