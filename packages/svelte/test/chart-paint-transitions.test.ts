import { expect, test } from 'bun:test';
import { chartBytesToBase64, chartContentModel, chartPropertyTree, createOoxmlChart, readChartGradientFill, setChartPictureFill, type ChartContent } from '@tumblerjs/charts';
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
    expect(shape() === existingShape).toBe(true);
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

test('rotated title backgrounds retain valid SVG paint through angle and fill changes', async () => {
  const client = await chartClient();
  const source = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', title: 'Rotated title', categories: ['A'], series: [{ name: 'Data', values: [2] }] }));
  const gradient = '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="0" scaled="0"/></a:gradFill>';
  const content = (angle: number, fill = gradient): ChartContent => ({ xml: source.replace('<a:bodyPr/>', `<a:bodyPr rot="${angle * 60000}"/>`).replace('</c:title>', `<c:spPr>${fill}</c:spPr></c:title>`),
    resources: { parts: [{ key: 'image', contentType: 'image/png', data: chartBytesToBase64(encodeRgbaPng(1, 1, new Uint8Array([255, 0, 0, 255]))) }], relationships: [{ id: 'image', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target: 'image' }] } });
  const target = document.createElement('div'); document.body.append(target);
  const app = client.mount(client.Harness, { target, props: { initial: chartContentModel(content(45)) } });
  const group = () => target.querySelector('svg.chart > g[transform]')!;
  try {
    client.flushSync();
    expect(group().getAttribute('transform')).toStartWith('rotate(45 ');
    app.setModel(chartContentModel(content(90))); await client.tick();
    expect(group().getAttribute('transform')).toStartWith('rotate(90 ');
    app.setModel(chartContentModel(content(90, '<a:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="image"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>'))); await client.tick();
    expect(group().querySelector('pattern image')).not.toBeNull();
    app.setModel(chartContentModel(content(0, '<a:solidFill><a:srgbClr val="123456"/></a:solidFill>'))); await client.tick();
    expect(target.querySelector('svg.chart > g[transform]')).toBeNull();
    app.setModel(chartContentModel(content(45))); await client.tick();
    expect(group().querySelector('linearGradient')).not.toBeNull();
  } finally { await client.unmount(app); await client.dispose(); }
});


test('a saved gradient opens with stable stop keys before rendering its editor', async () => {
  const client = await chartClient();
  const xml = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] }));
  const content = { xml: xml.replace('</c:chartSpace>', '<c:spPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:path path="rect"/></a:gradFill></c:spPr></c:chartSpace>') };
  const target = document.createElement('div'); document.body.append(target);
  const app = client.mount(client.Harness, { target, props: { initial: chartContentModel(content), content } });
  try {
    client.flushSync();
    target.querySelector<HTMLButtonElement>('[aria-label="Edit gradient for Entire chart"]')!.click();
    client.flushSync();
    expect(target.querySelectorAll('[role="slider"]')).toHaveLength(2);
    expect(new Set([...target.querySelectorAll('[data-stop]')].map(stop => stop.getAttribute('data-stop'))).size).toBe(2);
    expect(target.querySelector('[role="dialog"][aria-label="Gradient for Entire chart"]')).not.toBeNull();
    target.querySelector<HTMLButtonElement>('.gradient-editor .footer button')!.click();
    client.flushSync();
    expect(target.querySelector('[role="dialog"][aria-label="Gradient for Entire chart"]')).toBeNull();
  } finally { await client.unmount(app); await client.dispose(); }
});


test('an open gradient draft survives a title edit in the chart workbench', async () => {
  const client = await chartClient();
  const content = { xml: new TextDecoder().decode(createOoxmlChart({ type: 'bubbleChart', categories: ['A'], series: [{ name: 'Data', values: [2], xValues: [1], bubbleSizes: [3] }] })) };
  const target = document.createElement('div'); document.body.append(target);
  const app = client.mount(client.Harness, { target, props: { initial: chartContentModel(content), content, workbench: true } });
  const click = (selector: string) => { target.querySelector<HTMLButtonElement>(selector)!.click(); client.flushSync(); };
  try {
    client.flushSync();
    click('.fill-editor > .row .trigger');
    click('.fill-editor .choices button:nth-child(4)');
    expect(target.querySelector('.gradient-editor [role="dialog"]')).not.toBeNull();
    click('.gradient-editor .buttons:not(.footer) button');
    const position = target.querySelector<HTMLInputElement>('[aria-label="Gradient stop position for Entire chart"]')!;
    position.value = '67.5'; position.dispatchEvent(new Event('change', { bubbles: true })); client.flushSync();
    const title = [...target.querySelectorAll('label')].find(label => label.textContent?.trim() === 'Title')!.querySelector('input')!;
    title.click(); client.flushSync();
    expect(app.getContent()?.xml).toContain('Chart Title');
    expect(app.getContent()?.xml).not.toContain('gradFill');
    expect(target.querySelector('.gradient-editor [role="dialog"]')).not.toBeNull();
    click('.gradient-editor .footer button:nth-child(2)');
    expect(app.getContent()?.xml).toContain('Chart Title');
    const source = new TextEncoder().encode(app.getContent()!.xml);
    expect(readChartGradientFill(source, chartPropertyTree(source).id)?.stops.map(stop => stop.position)).toEqual([0, 1, .675]);
  } finally { await client.unmount(app); await client.dispose(); }
});
