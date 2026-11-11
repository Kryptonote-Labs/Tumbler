import { expect, test } from 'bun:test';
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { paintDrawingPicture } from '@tumblerjs/ooxml';
import { chartBytesToBase64, chartContentModel, createOoxmlChart, layoutChartScene, paintChartScene, updateChartTitle, type ChartMark, type ChartResources, type ChartScene } from '../src/index.ts';
import { chartMarksBounds } from '../src/shape-scene.ts';

const manual = '<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.2"/><c:y val="0.25"/></c:manualLayout></c:layout>';
function model(fill: string, angle: number, resources?: ChartResources) {
  const source = updateChartTitle(createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] }), [{ runs: [{ text: 'Painted title', style: { fontFamily: 'DejaVu Sans', fontSize: 18 } }] }]);
  const xml = new TextDecoder().decode(source).replace('<a:bodyPr/>', `<a:bodyPr rot="${angle * 60000}"/>`).replace('<c:overlay val="0"/>', `${manual}<c:overlay val="0"/>`).replace('</c:title>', `<c:spPr>${fill}<a:ln><a:noFill/></a:ln></c:spPr></c:title>`);
  const parsed = chartContentModel({ xml, ...(resources ? { resources } : {}) });
  if (parsed.status !== 'supported') throw new Error(parsed.reason);
  return parsed;
}
function background(scene: ChartScene) {
  const group = scene.marks.find(mark => mark.kind === 'group' && mark.rotation);
  if (group?.kind !== 'group' || !group.rotation) throw new Error('Missing text-box rotation');
  const rect = group.marks.find(mark => mark.kind === 'rect');
  if (rect?.kind !== 'rect') throw new Error('Missing text-box frame');
  return { group, rect, rotation: group.rotation };
}

test('a positioned title paints a rotated background rather than an upright bounding rectangle', () => {
  const scene = layoutChartScene(model('<a:solidFill><a:srgbClr val="00FF00"/></a:solidFill>', 45), 600, 400);
  const { group } = background(scene), bounds = chartMarksBounds({ measure: (text, font) => text.length * font.size * .55 }, [group])!;
  expect(bounds.x).toBeCloseTo(120);
  expect(bounds.y).toBeCloseTo(100);
  const canvas = createCanvas(600, 400), ctx = canvas.getContext('2d');
  paintChartScene(ctx, scene, d => new Path2D(d));
  const data = ctx.getImageData(0, 0, 600, 400).data;
  let green = 0;
  for (let index = 0; index < data.length; index += 4) if (data[index]! < 30 && data[index + 1]! > 220 && data[index + 2]! < 30) green++;
  expect(green).toBeGreaterThan(bounds.width * bounds.height * .1);
  expect(green).toBeLessThan(bounds.width * bounds.height * .65);
});

test('title gradients and picture fills rotate in the same local coordinates as their frames', () => {
  const image = createCanvas(40, 20), imageContext = image.getContext('2d');
  imageContext.fillStyle = '#FF0000'; imageContext.fillRect(0, 0, 20, 20);
  imageContext.fillStyle = '#0000FF'; imageContext.fillRect(20, 0, 20, 20);
  const resources: ChartResources = { parts: [{ key: 'image', contentType: 'image/png', data: chartBytesToBase64(image.toBuffer('image/png')) }], relationships: [{ id: 'image', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: 'image' }] };
  const gradient = '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="0" scaled="0"/></a:gradFill>';
  const picture = '<a:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="image"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>';
  for (const fill of [gradient, picture]) {
    const scene = layoutChartScene(model(fill, 90, resources), 600, 400), { rect, rotation } = background(scene);
    const canvas = createCanvas(600, 400), ctx = canvas.getContext('2d');
    paintChartScene(ctx, scene, d => new Path2D(d), { picture: (fill, width, height) => paintDrawingPicture(ctx, fill, width, height, { image, width: 40, height: 20 }) });
    const sample = (fraction: number) => {
      const x = rect.x + rect.width * fraction, y = rect.y + 1;
      return ctx.getImageData(Math.floor(rotation.cx - (y - rotation.cy)), Math.floor(rotation.cy + (x - rotation.cx)), 1, 1).data;
    };
    const top = sample(.2), bottom = sample(.8);
    expect(top[0]).toBeGreaterThan(top[2]!);
    expect(bottom[2]).toBeGreaterThan(bottom[0]!);
  }
});

test('a rotated group clips in its local frame and restores the following paint context', () => {
  const marks: ChartMark[] = [{ kind: 'group', rotation: { angle: 90, cx: 100, cy: 100 }, clip: { x: 50, y: 80, width: 50, height: 40 }, marks: [{ kind: 'rect', x: 50, y: 80, width: 100, height: 40, fill: '#FF0000' }] }, { kind: 'rect', x: 10, y: 10, width: 10, height: 10, fill: '#0000FF' }];
  const canvas = createCanvas(200, 200), ctx = canvas.getContext('2d');
  paintChartScene(ctx, { width: 200, height: 200, label: 'Clipped rotation', marks }, d => new Path2D(d));
  expect([...ctx.getImageData(100, 75, 1, 1).data]).toEqual([255, 0, 0, 255]);
  expect(ctx.getImageData(100, 125, 1, 1).data[3]).toBe(0);
  expect(ctx.getImageData(70, 75, 1, 1).data[3]).toBe(0);
  expect([...ctx.getImageData(15, 15, 1, 1).data]).toEqual([0, 0, 255, 255]);
});
