import { expect, test } from 'bun:test';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { createOoxmlChart, parseOoxmlChart, layoutChartScene, layoutCartesianChart, paintChartScene, type ChartMark } from '../src/index.ts';

const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
const shape = (color: string) => `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`;
function chart(overlay = false) {
  const xml = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', title: 'Painted title', categories: ['A', 'B'], series: [{ name: 'Data', values: [2, 4] }] }))
    .replace(/<c:title(?:\s[^>]*)?>[\s\S]*?<\/c:title>/, title => title.replace(/<c:overlay[^>]*\/>/, `<c:overlay val="${overlay ? 1 : 0}"/>`).replace('</c:title>', `${shape('FF0000')}</c:title>`))
    .replace('</c:plotArea>', `${shape('00FF00')}</c:plotArea>`)
    .replace('</c:legend>', `${shape('0000FF')}</c:legend>`)
    .replace('</c:chartSpace>', `${shape('FFFF00')}</c:chartSpace>`);
  const model = parseOoxmlChart(new TextEncoder().encode(xml), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  return model;
}

test('chart, plot, title and legend use their own authored backgrounds with hidden borders', () => {
  const model = chart();
  expect(model).toMatchObject({ chartArea: { fill: { value: '#FFFF00' } }, plotArea: { fill: { value: '#00FF00' } }, titleArea: { fill: { value: '#FF0000' } }, legend: { shapeStyle: { fill: { value: '#0000FF' } } } });
  const scene = layoutChartScene(model, 600, 400), marks = flatten(scene.marks);
  for (const fill of ['#FFFF00', '#00FF00', '#FF0000', '#0000FF']) expect(marks.find(mark => mark.kind === 'rect' && mark.fill === fill)?.stroke).toBeUndefined();
  expect(scene.marks[0]).toMatchObject({ fill: '#FFFF00' });
  const canvas = createCanvas(600, 400), context = canvas.getContext('2d');
  paintChartScene(context, scene, d => new Path2D(d));
  expect([...context.getImageData(2, 2, 1, 1).data]).toEqual([255, 255, 0, 255]);
});

test('an overlay title uses plot space and paints after plot data', () => {
  const ordinary = chart(), overlay = chart(true);
  expect(layoutCartesianChart(overlay, 600, 400).plot.y).toBeLessThan(layoutCartesianChart(ordinary, 600, 400).plot.y);
  const marks = layoutChartScene(overlay, 600, 400).marks;
  expect(marks.at(-1)).toMatchObject({ kind: 'text', text: 'Painted title' });
});

test('explicit no-fill and no-line keep the chart canvas transparent', () => {
  const model = chart();
  const scene = layoutChartScene({ ...model, chartArea: { noFill: true, lineStyle: { noFill: true } } }, 600, 400);
  const canvas = createCanvas(600, 400), context = canvas.getContext('2d');
  paintChartScene(context, scene, d => new Path2D(d));
  expect(context.getImageData(2, 2, 1, 1).data[3]).toBe(0);
});


test('a combination paints its shared plot background once before every plot', () => {
  const model = chart();
  const second = { ...model, kind: 'line' as const, series: model.series.map(series => ({ ...series, index: series.index + 1 })) };
  const scene = layoutChartScene({ ...model, plots: [model, second], series: [...model.series, ...second.series] }, 600, 400);
  const marks = flatten(scene.marks);
  expect(marks.filter(mark => mark.kind === 'rect' && mark.fill === '#00FF00')).toHaveLength(1);
  const background = marks.findIndex(mark => mark.kind === 'rect' && mark.fill === '#00FF00');
  expect(marks.slice(0, background).some(mark => mark.kind === 'rect' && mark.fill === '#4472C4')).toBe(false);
});
