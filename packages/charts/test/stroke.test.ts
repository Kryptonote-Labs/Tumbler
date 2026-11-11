import { expect, test } from 'bun:test';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { createOoxmlChart, parseOoxmlChart, layoutChartScene, paintChartScene, type ChartMark } from '../src/index.ts';

const flatten = (marks: readonly ChartMark[]): ChartMark[] => marks.flatMap(mark => mark.kind === 'group' ? flatten(mark.marks) : [mark]);
test('custom dash lengths, round caps and miter joins reach line geometry in CSS pixels', () => {
  const source = new TextDecoder().decode(createOoxmlChart({ type: 'lineChart', categories: ['A', 'B'], series: [{ name: 'Data', values: [2, 4] }] })).replace(/<a:ln>[\s\S]*?<\/a:ln>/, '<a:ln w="25400" cap="rnd"><a:solidFill><a:srgbClr val="AA00AA"/></a:solidFill><a:custDash><a:ds d="300000" sp="100000"/><a:ds d="100%" sp="200%"/></a:custDash><a:miter lim="400000"/></a:ln>');
  const model = parseOoxmlChart(new TextEncoder().encode(source), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  expect(model.series[0]?.lineStyle).toMatchObject({ dash: [3, 1, 1, 2], cap: 'round', join: 'miter', miterLimit: 4 });
  const path = flatten(layoutChartScene(model, 600, 400).marks).find(mark => mark.kind === 'path' && mark.stroke === '#AA00AA');
  expect(path).toMatchObject({ strokeWidth: 8 / 3, strokeDash: [8, 8 / 3, 8 / 3, 16 / 3], strokeCap: 'round', strokeJoin: 'miter', miterLimit: 4 });
});

test('point outlines retain their own dash and paint instead of inheriting a hidden series line', () => {
  const source = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] })).replace(/<a:ln>[\s\S]*?<\/a:ln>/, '<a:ln><a:noFill/></a:ln>').replace('<c:cat>', '<c:dPt><c:idx val="0"/><c:spPr><a:ln w="12700"><a:solidFill><a:srgbClr val="00AABB"/></a:solidFill><a:prstDash val="dashDot"/></a:ln></c:spPr></c:dPt><c:cat>');
  const model = parseOoxmlChart(new TextEncoder().encode(source), 'transitional');
  if (model.status !== 'supported') throw new Error(model.reason);
  const bar = flatten(layoutChartScene(model, 600, 400).marks).find(mark => mark.kind === 'rect' && mark.stroke === '#00AABB');
  expect(bar?.strokeDash).toEqual([16 / 3, 4, 4 / 3, 4]);
});

test('canvas paints dash gaps and resets the pattern before a following solid mark', () => {
  const canvas = createCanvas(32, 24), context = canvas.getContext('2d');
  paintChartScene(context, { width: 32, height: 24, label: 'Dashes', marks: [
    { kind: 'rect', x: 0, y: 0, width: 32, height: 24, fill: '#FFFFFF' },
    { kind: 'line', x1: 0, y1: 5, x2: 32, y2: 5, width: 2, stroke: '#000000', strokeDash: [4, 4] },
    { kind: 'line', x1: 0, y1: 15, x2: 32, y2: 15, width: 2, stroke: '#000000' },
  ] }, value => new Path2D(value));
  expect(context.getImageData(1, 5, 1, 1).data[0]).toBe(0);
  expect(context.getImageData(6, 5, 1, 1).data[0]).toBe(255);
  expect(context.getImageData(6, 15, 1, 1).data[0]).toBe(0);
});
