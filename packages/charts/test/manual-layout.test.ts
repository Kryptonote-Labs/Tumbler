import { expect, test } from 'bun:test';
import { createOoxmlChart, layoutChartScene, layoutCartesianChart, layoutCombinationChart, layoutScatterChart, parseOoxmlChart, type ChartMark, type CreateChartOptions } from '../src/index.ts';
import { chartManualRect } from '../src/manual-layout.ts';

const encoder = new TextEncoder();
const manual = '<c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.2"/><c:y val="0.25"/><c:w val="0.5"/><c:h val="0.5"/></c:manualLayout>';
function chart(type: CreateChartOptions['type'] = 'barChart', layout = manual) {
  const xml = new TextDecoder().decode(createOoxmlChart({ type, categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3], xValues: [1, 2, 3], bubbleSizes: [3, 2, 1] }, { name: 'Other', values: [3, 2, 4], xValues: [1, 2, 3], bubbleSizes: [1, 2, 3] }, ...(type === 'stockChart' ? [{ name: 'Close', values: [2, 3, 3] }] : [])] }))
    .replace('<c:plotArea><c:layout/>', `<c:plotArea><c:layout>${layout}</c:layout>`)
    .replace('</c:plotArea>', '<c:spPr><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill></c:spPr></c:plotArea>');
  const model = parseOoxmlChart(encoder.encode(xml), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return model;
}
const flatten = (marks: readonly ChartMark[]): readonly ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);

test('native inner plot fractions set the data box across categorical, XY, pie, radar, stock and surface charts', () => {
  for (const type of ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'area3DChart', 'pieChart', 'pie3DChart', 'doughnutChart', 'radarChart', 'surfaceChart', 'surface3DChart', 'scatterChart', 'bubbleChart', 'stockChart', 'ofPieChart'] as const) {
    const model = chart(type), marks = flatten(layoutChartScene(model, 600, 400).marks);
    const plot = marks.find(mark => mark.kind === 'rect' && mark.fill === '#00FF00');
    expect(plot).toMatchObject({ x: 120, y: 100, width: 300, height: 200 });
  }
  expect(layoutCartesianChart(chart(), 600, 400).plot).toEqual({ x: 120, y: 100, width: 300, height: 200 });
  expect(layoutScatterChart(chart('scatterChart'), 600, 400).plot).toEqual({ x: 120, y: 100, width: 300, height: 200 });
});

test('factor positions offset the automatic box while edge sizes name its far edge', () => {
  const automatic = { x: 30, y: 20, width: 500, height: 300 };
  expect(chartManualRect({ x: .1, y: -.025, width: .5, height: .5 }, automatic, 600, 400)).toEqual({ x: 90, y: 10, width: 300, height: 200 });
  expect(chartManualRect({ xMode: 'edge', yMode: 'edge', widthMode: 'edge', heightMode: 'edge', x: .2, y: .25, width: .7, height: .75 }, automatic, 600, 400)).toEqual({ x: 120, y: 100, width: 300, height: 200 });
  expect(chartManualRect({ xMode: 'edge', yMode: 'edge', x: .8, y: .9, width: .5, height: .5 }, automatic, 600, 400)).toEqual({ x: 300, y: 200, width: 300, height: 200 });
});

test('invalid manual coordinates retain automatic layout without rejecting chart source', () => {
  const automatic = chart('barChart', '');
  const invalid = chart('barChart', manual.replace('val="0.2"', 'val="-0.1"'));
  expect(invalid.plotLayout).toBeUndefined();
  expect(layoutCartesianChart(invalid, 600, 400).plot).toEqual(layoutCartesianChart(automatic, 600, 400).plot);
});

test('an empty or vertical-only manual layout keeps secondary-axis plot space in combinations', () => {
  const base = chart('barChart', '');
  const { plotLayout: _manual, ...primary } = base;
  const secondary = { ...primary, series: primary.series.map(series => ({ ...series, index: series.index + 2 })), axes: primary.axes.map(axis => ({ ...axis, id: axis.id + 10, position: axis.kind === 'value' ? 'right' as const : axis.position })), axisIds: primary.axisIds!.map(id => id + 10) };
  const combo = { ...primary, plots: [primary, secondary], series: [...primary.series, ...secondary.series] };
  const automatic = layoutCombinationChart(combo, 600, 400)[0]!.plot;
  expect(layoutCombinationChart({ ...combo, plotLayout: {} }, 600, 400)[0]!.plot).toEqual(automatic);
  expect(layoutCombinationChart({ ...combo, plotLayout: { target: 'inner', yMode: 'edge', y: .05 } }, 600, 400)[0]!.plot).toEqual({ ...automatic, y: 20 });
  expect(layoutCombinationChart({ ...combo, plotLayout: { target: 'inner', width: .5 } }, 600, 400)[0]!.plot.width).toBe(300);
});

test('zero native plot extents keep the chart and legend instead of failing its preview', () => {
  for (const type of ['barChart', 'bar3DChart', 'pieChart', 'pie3DChart', 'radarChart', 'stockChart', 'surface3DChart', 'bubbleChart'] as const) {
    const model = chart(type, manual.replace('c:w val="0.5"', 'c:w val="0"').replace('c:h val="0.5"', 'c:h val="0"'));
    const scene = layoutChartScene({ ...model, title: 'Kept title' }, 600, 400);
    expect(flatten(scene.marks).some(mark => mark.kind === 'text' && mark.text === 'Kept title')).toBe(true);
    expect(scene.label).not.toBe('Chart preview unavailable');
    expect(scene.marks.some(mark => mark.kind === 'group' && mark.role === 'legend')).toBe(true);
    expect(flatten(scene.marks).some(mark => mark.kind === 'rect' && mark.fill === '#00FF00')).toBe(false);
  }
});

test('outer plot layout assigns measured margins to physical High/Low label sides', () => {
  const base = chart('barChart', manual.replace('val="inner"', 'val="outer"'));
  const ordinary = layoutCartesianChart(base, 600, 400).plot;
  const right = { ...base, axes: base.axes.map(axis => axis.kind === 'value' ? { ...axis, position: 'right' as const } : axis) };
  const rightPlot = layoutCartesianChart(right, 600, 400).plot;
  expect(ordinary.x).toBeGreaterThan(120);
  expect(rightPlot.x).toBe(120);
  expect(rightPlot.width).toBeCloseTo(ordinary.width);
  const high = { ...right, axes: right.axes.map(axis => axis.kind === 'category' ? { ...axis, tickLabelPosition: 'high' as const } : axis) };
  expect(layoutCartesianChart(high, 600, 400).plot.y).toBeGreaterThan(100);
  const low = { ...right, axes: right.axes.map(axis => axis.kind === 'value' ? { ...axis, tickLabelPosition: 'low' as const } : axis) };
  expect(layoutCartesianChart(low, 600, 400).plot.x).toBeGreaterThan(120);
});

test('outer margins measure cached currency and date formats exactly as the axes render them', () => {
  for (const type of ['barChart', 'scatterChart'] as const) {
    const base = chart(type, manual.replace('val="inner"', 'val="outer"'));
    const cached = { ...base, series: base.series.map(series => ({ ...series, values: { ...series.values!, formatCode: '$0.00' } })) };
    const explicit = { ...cached, axes: cached.axes.map(axis => axis.kind === 'value' ? { ...axis, numberFormatCode: '$0.00' } : axis) };
    const layout = type === 'barChart' ? layoutCartesianChart : layoutScatterChart;
    expect(layout(cached, 600, 400).plot).toEqual(layout(explicit, 600, 400).plot);
  }
  const base = chart('barChart', manual.replace('val="inner"', 'val="outer"'));
  const dated = { ...base,
    axes: base.axes.map(axis => axis.kind === 'category' ? { ...axis, dateAxis: true, tickLabelPosition: 'high' as const } : axis),
    series: base.series.map(series => ({ ...series, categories: { kind: 'number' as const, formula: undefined, formatCode: 'mmmm yyyy', points: [45000, 45030, 45060].map((value, index) => ({ index, value })) } })),
  };
  const measured: string[] = [];
  layoutCartesianChart(dated, 600, 400, text => { measured.push(text); return text.length * 6; });
  expect(measured).toContain('March 2023');
});
