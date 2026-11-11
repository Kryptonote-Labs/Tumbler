import { expect, test } from 'bun:test';
import { parseLosslessXml } from '@tumblerjs/ooxml';
import { createOoxmlChart, parseOoxmlChart, updateChartTitle, type ChartTextParagraph } from '../src/index.ts';

function fixture(conformance: 'strict' | 'transitional' = 'transitional') {
  const drawing = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/drawingml/main' : 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const paragraph = `<d:p xmlns:d="${drawing}"><d:pPr fontAlgn="base"><d:defRPr sz="1600"/></d:pPr><!--keep paragraph metadata--><?chart retained?><d:r><d:t>Period </d:t></d:r><d:fld xmlns:a="urn:custom" id="{1421411B-1421-1421-1421-142141214121}" type="datetime1"><d:rPr lang="en-GB" b="1"/><d:pPr marL="25400"/><d:t><![CDATA[Q1 & Q2]]></d:t></d:fld><d:br><d:rPr sz="2200" i="1"/></d:br><d:r><d:t>Forecast</d:t></d:r><d:endParaRPr sz="2400" lang="fr-FR"><d:solidFill><d:schemeClr val="accent3"/></d:solidFill><d:extLst><d:ext uri="urn:chart-test"><x:keep xmlns:x="urn:field-metadata" value="retained"/></d:ext></d:extLst></d:endParaRPr></d:p>`;
  const bytes = createOoxmlChart({ type: 'barChart', conformance, title: 'Initial', categories: ['A'], series: [{ name: 'Data', values: [2] }] });
  const source = new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/<a:p\b[\s\S]*?<\/a:p>/, paragraph));
  return { source, drawing, conformance };
}

function change(source: Uint8Array, conformance: 'strict' | 'transitional', edit: (paragraph: ChartTextParagraph) => ChartTextParagraph) {
  const title = parseOoxmlChart(source, conformance).titleText!;
  return updateChartTitle(source, title.map(edit));
}

for (const conformance of ['strict', 'transitional'] as const) test(`${conformance} rich edits retain field identity, breaks and paragraph-end formatting`, () => {
  const f = fixture(conformance);
  const edited = change(f.source, conformance, paragraph => ({ ...paragraph, alignment: 'end', runs: paragraph.runs.map(run => ({ ...run, text: run.text === 'Forecast' ? 'Revised forecast' : run.text, style: { ...run.style, bold: true } })) }));
  const xml = parseLosslessXml(edited), field = xml.elements(f.drawing, 'fld')[0]!;
  expect(xml.elements(f.drawing, 'fld')).toHaveLength(1);
  expect(field.attributes.find(attribute => attribute.localName === 'id')?.value).toBe('{1421411B-1421-1421-1421-142141214121}');
  expect(field.attributes.find(attribute => attribute.localName === 'type')?.value).toBe('datetime1');
  expect(xml.textContent(field)).toBe('Q1 & Q2');
  expect(field.children.some(node => node.kind === 'element' && node.localName === 'pPr' && node.attributes.some(attribute => attribute.localName === 'marL' && attribute.value === '25400'))).toBe(true);
  expect(xml.elements(f.drawing, 'br')).toHaveLength(1);
  expect(xml.elements(f.drawing, 'endParaRPr')).toHaveLength(1);
  expect(xml.elements(f.drawing, 'endParaRPr')[0]!.attributes.find(attribute => attribute.localName === 'lang')?.value).toBe('fr-FR');
  expect(xml.elements('urn:field-metadata', 'keep')).toHaveLength(1);
  const result = parseOoxmlChart(edited, conformance).titleText![0]!;
  expect(result.runs.map(run => run.text)).toEqual(['Period ', 'Q1 & Q2', '\n', 'Revised forecast']);
  expect(result.runs[2]?.style).toMatchObject({ fontSize: 22, italic: true, bold: true });
  expect(parseOoxmlChart(edited, conformance).title).toBe('Period Q1 & Q2\nRevised forecast');
  expect(new TextDecoder().decode(edited)).toContain('<!--keep paragraph metadata-->');
  expect(new TextDecoder().decode(edited)).toContain('<?chart retained?>');
});

test('repeated field text edits retain field metadata without duplicating opaque properties', () => {
  const f = fixture();
  let bytes: Uint8Array = f.source;
  for (const text of ['Q3', 'Q4', 'Final quarter']) bytes = change(bytes, f.conformance, paragraph => ({ ...paragraph, runs: paragraph.runs.map(run => run.sourceWrapper?.localName === 'fld' ? { ...run, text, style: { ...run.style, italic: true } } : run) }));
  const xml = parseLosslessXml(bytes);
  expect(xml.elements(f.drawing, 'fld')).toHaveLength(1);
  expect(xml.textContent(xml.elements(f.drawing, 'fld')[0]!)).toBe('Final quarter');
  expect(xml.elements(f.drawing, 'endParaRPr')).toHaveLength(1);
  expect(xml.elements('urn:field-metadata', 'keep')).toHaveLength(1);
  expect(parseOoxmlChart(bytes, f.conformance).titleText![0]!.runs[1]?.style).toMatchObject({ bold: true, italic: true });
});

test('rich title metadata remains usable when copied between strict and transitional charts', () => {
  const strict = fixture('strict');
  const title = parseOoxmlChart(strict.source, 'strict').titleText!;
  const target = createOoxmlChart({ type: 'pieChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] });
  const copied = updateChartTitle(target, title), xml = parseLosslessXml(copied);
  const drawing = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  expect(xml.elements(drawing, 'fld')).toHaveLength(1);
  expect(xml.elements(drawing, 'endParaRPr')).toHaveLength(1);
  expect(xml.elements(strict.drawing, 'fld')).toHaveLength(0);
  expect(xml.elements('urn:field-metadata', 'keep')).toHaveLength(1);
  expect(parseOoxmlChart(copied, 'transitional').titleText![0]!.runs.map(run => run.text)).toEqual(['Period ', 'Q1 & Q2', '\n', 'Forecast']);
});

test('a colour edit retains comments and instructions while ordering native run properties', () => {
  const f = fixture();
  const source = new TextEncoder().encode(new TextDecoder().decode(f.source).replace('<d:r><d:t>Period </d:t>', '<d:r><d:rPr><d:latin typeface="Aptos"/><!--keep run metadata--><?chart run?></d:rPr><d:t>Period </d:t>'));
  const edited = change(source, f.conformance, paragraph => ({ ...paragraph, runs: paragraph.runs.map((run, index) => index ? run : { ...run, style: { ...run.style, color: { kind: 'rgb', value: '#123456' } } }) }));
  const xml = parseLosslessXml(edited), properties = xml.elements(f.drawing, 'rPr')[0]!;
  expect(properties.children.filter(node => node.kind === 'element').map(node => node.localName)).toEqual(['solidFill', 'latin']);
  expect(properties.children.some(node => node.kind === 'comment' && node.value === 'keep run metadata')).toBe(true);
  expect(properties.children.some(node => node.kind === 'processing_instruction' && node.value === 'chart run')).toBe(true);
});

test('copied native metadata keeps inherited MC namespace references after serialization', () => {
  const f = fixture();
  const source = new TextEncoder().encode(new TextDecoder().decode(f.source)
    .replace('<c:chartSpace ', '<c:chartSpace xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:x="urn:field-metadata" ')
    .replace('<d:p xmlns:d=', '<d:p mc:Ignorable="x" mc:ProcessContent="x:keep" xmlns:d='));
  const title = structuredClone(parseOoxmlChart(source, f.conformance).titleText!);
  const target = createOoxmlChart({ type: 'pieChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] });
  const copied = updateChartTitle(target, title), xml = parseLosslessXml(copied), paragraph = xml.elements(f.drawing, 'p')[0]!;
  expect(paragraph.attributes.find(attribute => attribute.qualified === 'xmlns:x')?.value).toBe('urn:field-metadata');
  expect(paragraph.attributes.find(attribute => attribute.localName === 'Ignorable')?.value).toBe('x');
  expect(paragraph.attributes.find(attribute => attribute.localName === 'ProcessContent')?.value).toBe('x:keep');
  expect(xml.elements('urn:field-metadata', 'keep')).toHaveLength(1);
});

test('copied fragments retain inherited MC directives by namespace even after a prefix is rebound', () => {
  const f = fixture();
  const source = new TextEncoder().encode(new TextDecoder().decode(f.source)
    .replace('<c:chartSpace ', '<c:chartSpace xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:x="urn:ancestor-metadata" mc:Ignorable="x" mc:PreserveElements="x:keep" ')
    .replace('<d:p xmlns:d=', '<d:p xmlns:x="urn:field-metadata" mc:Ignorable="x" mc:ProcessContent="x:keep" xmlns:d='));
  const title = structuredClone(parseOoxmlChart(source, f.conformance).titleText!);
  const target = createOoxmlChart({ type: 'pieChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] });
  const copied = updateChartTitle(target, title), xml = parseLosslessXml(copied), paragraph = xml.elements(f.drawing, 'p')[0]!;
  const namespace = (prefix: string) => paragraph.attributes.find(attribute => attribute.qualified === `xmlns:${prefix}`)?.value;
  const ignore = paragraph.attributes.find(attribute => attribute.localName === 'Ignorable')!.value.split(' ');
  expect(ignore.map(namespace).sort()).toEqual(['urn:ancestor-metadata', 'urn:field-metadata']);
  const preserved = paragraph.attributes.find(attribute => attribute.localName === 'PreserveElements')!.value.split(':');
  expect(namespace(preserved[0]!)).toBe('urn:ancestor-metadata');
  expect(preserved[1]).toBe('keep');
  const process = paragraph.attributes.find(attribute => attribute.localName === 'ProcessContent')!.value.split(':');
  expect(namespace(process[0]!)).toBe('urn:field-metadata');
  expect(process[1]).toBe('keep');
});

test('root-declared ignorable metadata stays ignorable when its paragraph is copied alone', () => {
  const f = fixture();
  const source = new TextEncoder().encode(new TextDecoder().decode(f.source)
    .replace('<c:chartSpace ', '<c:chartSpace xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:x="urn:field-metadata" mc:Ignorable="x" mc:ProcessContent="x:keep" '));
  const target = createOoxmlChart({ type: 'pieChart', categories: ['A'], series: [{ name: 'Data', values: [2] }] });
  const copied = updateChartTitle(target, structuredClone(parseOoxmlChart(source, f.conformance).titleText!));
  const paragraph = parseLosslessXml(copied).elements(f.drawing, 'p')[0]!;
  expect(paragraph.attributes.find(attribute => attribute.localName === 'Ignorable')?.value).toBe('x');
  expect(paragraph.attributes.find(attribute => attribute.localName === 'ProcessContent')?.value).toBe('x:keep');
  expect(paragraph.attributes.find(attribute => attribute.qualified === 'xmlns:x')?.value).toBe('urn:field-metadata');
});
