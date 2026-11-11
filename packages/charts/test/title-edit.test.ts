import { expect, test } from 'bun:test';
import { parseOoxmlChart, updateChartTitle } from '../src/index.ts';

for (const conformance of ['strict', 'transitional'] as const) {
  const ns = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/drawingml/chart' : 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  for (const title of ['', '<c:title/>', '<c:title><c:tx><c:strRef><c:f>Sheet1!A1</c:f></c:strRef></c:tx><c:overlay val="1"/></c:title>']) {
    test(`${conformance} chart title replacement retains chart data: ${title || 'absent'}`, () => {
      const plot = '<c:plotArea><c:pieChart><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numLit><c:pt idx="0"><c:v>42</c:v></c:pt></c:numLit></c:val></c:ser></c:pieChart></c:plotArea>';
      const xml = `<c:chartSpace xmlns:c="${ns}"><c:chart>${title}<c:autoTitleDeleted val="1"/>${plot}</c:chart></c:chartSpace>`;
      const result = updateChartTitle(new TextEncoder().encode(xml), 'Growth & <targets>');
      expect(new TextDecoder().decode(result)).toContain(plot);
      expect(parseOoxmlChart(result, conformance)).toMatchObject({ title: 'Growth & <targets>' });
      expect(parseOoxmlChart(result, conformance).titleFormula).toBeUndefined();
    });
  }
}

test('rich title runs retain independent formatting through XML and scene layout', async () => {
  const { layoutChartScene } = await import('../src/index.ts');
  const ns = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const xml = new TextEncoder().encode(`<c:chartSpace xmlns:c="${ns}"><c:chart><c:plotArea><c:pieChart/></c:plotArea></c:chart></c:chartSpace>`);
  const title = [{ alignment: 'center' as const, runs: [
    { text: 'Chart', style: { bold: true, fontSize: 18, underline: 'double' as const, highlight: '#FFFF00', color: { kind: 'rgb' as const, value: '#C00000' } } },
    { text: ' Title', style: { bold: false, italic: true, fontSize: 14 } },
  ] }];
  const model = parseOoxmlChart(updateChartTitle(xml, title), 'transitional');
  expect(model.titleText).toMatchObject(title);
  if (model.status !== 'supported') throw new Error('Expected chart');
  const scene = layoutChartScene(model, 576, 336);
  expect(scene.marks).toContainEqual(expect.objectContaining({ kind: 'text', text: 'Chart', font: expect.objectContaining({ weight: 700, size: 24, color: '#C00000' }) }));
  expect(scene.marks).toContainEqual(expect.objectContaining({ kind: 'text', text: ' Title', font: expect.objectContaining({ weight: 400, italic: true }) }));
  expect(scene.marks).toContainEqual(expect.objectContaining({ kind: 'rect', fill: '#FFFF00' }));
});

test('plain title edits retain styled runs, colour transforms and text-box properties', () => {
  const source = new TextEncoder().encode('<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:bodyPr rot="5400000"/><a:lstStyle/><a:p><a:pPr fontAlgn="base"/><a:r><a:rPr b="1"><a:solidFill><a:srgbClr val="204080"><a:alpha val="50000"/></a:srgbClr></a:solidFill></a:rPr><a:t>Old </a:t></a:r><a:r><a:rPr i="1"/><a:t>text</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:pieChart/></c:plotArea></c:chart></c:chartSpace>');
  const result = new TextDecoder().decode(updateChartTitle(source, 'New text'));
  expect(result).toContain('rot="5400000"');
  expect(result).toContain('fontAlgn="base"');
  expect(result).toContain('alpha val="50000"');
  expect(result).toContain('b="1"');
  expect(result).toContain('i="1"');
  expect(result).toContain('New ');
  expect(result).not.toContain('Old ');
});


test('self-closing imported title text accepts preserved leading whitespace', async () => {
  const { createOoxmlChart } = await import('../src/index.ts');
  const source = updateChartTitle(createOoxmlChart({ type: 'pieChart', categories: [], series: [] }), 'Original');
  const empty = new TextEncoder().encode(new TextDecoder().decode(source).replace(/<a:t(?: [^>]*)?>Original<\/a:t>/, '<a:t/>'));
  expect(new TextDecoder().decode(empty)).toContain('<a:t/>');
  const changed = new TextDecoder().decode(updateChartTitle(empty, ' New'));
  expect(changed).toContain('<a:t xml:space="preserve"> New</a:t>');
});

test('rich title edits keep text-box layout and unmodeled run/paragraph properties', () => {
  const source = new TextEncoder().encode('<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:d="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><d:bodyPr rot="2400000" lIns="12700"/><d:lstStyle/><d:p><d:pPr fontAlgn="base"><d:lnSpc><d:spcPct val="120000"/></d:lnSpc></d:pPr><d:r><d:rPr lang="en-GB" baseline="20000" u="wavy"><d:solidFill><d:schemeClr val="accent1"><d:alpha val="45000"/></d:schemeClr></d:solidFill><d:effectLst><d:glow rad="12700"><d:schemeClr val="accent2"/></d:glow></d:effectLst><d:ea typeface="Yu Gothic"/></d:rPr><d:t>Original</d:t></d:r></d:p></c:rich></c:tx></c:title><c:plotArea><c:pieChart/></c:plotArea></c:chart></c:chartSpace>');
  const parsed = parseOoxmlChart(source, 'transitional');
  const title = parsed.titleText!.map(paragraph => ({ ...paragraph, runs: paragraph.runs.map(run => ({ ...run, text: 'Revised', style: { ...run.style, bold: true } })) }));
  const result = new TextDecoder().decode(updateChartTitle(source, title));
  for (const property of ['rot="2400000"', 'lIns="12700"', 'fontAlgn="base"', 'val="120000"', 'lang="en-GB"', 'baseline="20000"', 'u="wavy"', 'val="45000"', 'glow', 'Yu Gothic', 'b="1"']) expect(result).toContain(property);
  expect(parseOoxmlChart(new TextEncoder().encode(result), 'transitional')).toMatchObject({ title: 'Revised' });
});

test('retained DrawingML properties can keep a conflicting unused a namespace binding', async () => {
  const { parseLosslessXml } = await import('@tumblerjs/ooxml');
  const drawing = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const source = new TextEncoder().encode(`<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:d="${drawing}"><c:chart><c:title><c:tx><c:rich><d:bodyPr/><d:lstStyle/><d:p><d:pPr xmlns:a="urn:custom"/><d:r><d:rPr xmlns:a="urn:custom" lang="en-GB"/><d:t>Old</d:t></d:r></d:p></c:rich></c:tx></c:title><c:plotArea><c:pieChart/></c:plotArea></c:chart></c:chartSpace>`);
  const model = parseOoxmlChart(source, 'transitional');
  const title = model.titleText!.map(paragraph => ({ ...paragraph, runs: paragraph.runs.map(run => ({ ...run, text: 'New', style: { ...run.style, bold: true, color: { kind: 'rgb' as const, value: '#123456' } } })) }));
  const result = updateChartTitle(source, title), xml = parseLosslessXml(result);
  expect(xml.elements(drawing, 'rPr')).toHaveLength(1);
  expect(xml.elements('urn:custom', 'rPr')).toHaveLength(0);
  expect(parseOoxmlChart(result, 'transitional')).toMatchObject({ title: 'New', titleText: [{ runs: [{ style: { bold: true, color: { kind: 'rgb', value: '#123456' } } }] }] });
});
