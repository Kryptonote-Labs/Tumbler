import { expect, test } from 'bun:test';
import { chartBytesToBase64, chartContentModel, chartPropertyTree, createOoxmlChart, setChartPictureFill, type ChartContent } from '@tumblerjs/charts';
import { encodeRgbaPng } from '@tumblerjs/ooxml';
import { chartClient } from './helpers/chart-client.ts';

test('native fill changes keep valid SVG paint, and gradient edits reuse the existing shape', async () => {
  const client = await chartClient();
  const xml = new TextDecoder().decode(createOoxmlChart({ type: 'bar3DChart', shape: 'cylinder', categories: ['A'], series: [{ name: 'Data', values: [2] }] }));
  const fill = (markup: string): ChartContent => ({ xml: xml.replace('</c:chartSpace>', `<c:spPr>${markup}</c:spPr></c:chartSpace>`) });
  const gradient = (angle: number) => fill(`<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="${angle * 60000}" scaled="0"/></a:gradFill>`);
  const picture = setChartPictureFill(gradient(0), chartPropertyTree(new TextEncoder().encode(xml)).id, { data: chartBytesToBase64(encodeRgbaPng(1, 1, new Uint8Array([255, 0, 0, 255]))), contentType: 'image/png' });
  const target = document.createElement('div'); document.body.append(target);
  const app = client.mount(client.Harness, { target, props: { initial: chartContentModel(gradient(0)) } });
  const shape = () => target.querySelector('svg.chart > rect')!;
  const paint = () => { const id = shape().getAttribute('fill')!.slice(5, -1); return target.querySelector(`[id="${id}"]`)!; };
  try {
    client.flushSync();
    const existingShape = shape(), before = paint().getAttribute('x1');
    app.setModel(chartContentModel(gradient(90))); await client.tick();
    expect(shape()).toBe(existingShape);
    expect(paint().getAttribute('x1')).not.toBe(before);
    app.setModel(chartContentModel(picture)); await client.tick();
    expect(paint().localName).toBe('pattern'); expect(paint().querySelector('image')).not.toBeNull();
    app.setModel(chartContentModel(fill('<a:solidFill><a:srgbClr val="123456"/></a:solidFill>'))); await client.tick();
    expect(shape().getAttribute('fill')?.toUpperCase()).toBe('#123456');
    app.setModel(chartContentModel(fill('<a:pattFill prst="pct10"><a:fgClr><a:srgbClr val="000000"/></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill>'))); await client.tick();
    expect(paint().localName).toBe('pattern'); expect(paint().getAttribute('width')).toBe('8');
    app.setModel(chartContentModel(gradient(45))); await client.tick();
    expect(paint().localName).toBe('linearGradient'); expect(target.querySelectorAll('svg.chart')).toHaveLength(1);
  } finally { await client.unmount(app); await client.dispose(); }
});
