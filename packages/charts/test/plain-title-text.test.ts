import { expect, test } from 'bun:test';
import { createOoxmlChart, parseOoxmlChart, updateChartTitle, type ChartTextParagraph } from '../src/index.ts';
import { replacePlainChartTitle } from '../src/plain-title-text.ts';

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);
function source(conformance: 'strict' | 'transitional' = 'transitional') {
  const created = createOoxmlChart({ type: 'pieChart', conformance, categories: ['A'], series: [{ name: 'Data', values: [1] }] });
  const rich = '<c:title><c:tx><c:rich><a:bodyPr rot="1800000" lIns="12700"/><a:lstStyle/><a:p><a:pPr algn="l" fontAlgn="base"><a:lnSpc><a:spcPct val="120000"/></a:lnSpc></a:pPr><a:r><a:rPr b="1"><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill></a:rPr><a:t>North</a:t></a:r><a:br><a:rPr sz="900"/></a:br><a:fld id="{58F21D69-5273-4DAC-91F4-A80D598243B0}" type="slidenum"><a:rPr i="1"/><a:t>42</a:t></a:fld><a:endParaRPr lang="en-GB" sz="1800"/><!--first-end--></a:p><a:p><a:pPr algn="r" marL="25400"/><a:r><a:rPr u="dbl"><a:latin typeface="Aptos"/></a:rPr><a:t>South</a:t></a:r><a:endParaRPr sz="1400"/><!--second-end--></a:p></c:rich></c:tx><c:overlay val="1"/></c:title>';
  return encode(decode(created).replace('<c:autoTitleDeleted', `${rich}<c:autoTitleDeleted`));
}

test('plain multiline edits keep unaffected runs, native breaks, fields and paragraph properties', () => {
  for (const conformance of ['strict', 'transitional'] as const) {
    const changed = updateChartTitle(source(conformance), 'East\n42\nSouth');
    const parsed = parseOoxmlChart(changed, conformance), xml = decode(changed);
    expect(parsed.title).toBe('East\n42\nSouth');
    expect(parsed.titleText?.[0]?.runs.map(run => [run.text, run.style?.bold, run.style?.italic])).toEqual([['East', true, undefined], ['\n', undefined, undefined], ['42', undefined, true]]);
    for (const value of ['rot="1800000"', 'lIns="12700"', 'fontAlgn="base"', 'val="120000"', 'lumMod', '75000', 'type="slidenum"', 'lang="en-GB"', 'first-end', 'second-end', 'marL="25400"', 'Aptos']) expect(xml).toContain(value);
    expect(parsed.titleText?.[1]?.alignment).toBe('end');
    expect(parsed.titleText?.[1]?.runs[0]?.style?.underline).toBe('double');
  }
});

test('inserted paragraphs inherit the edited run style without duplicating field identities', () => {
  const changed = updateChartTitle(source(), 'North\n4\n2\nSouth'), xml = decode(changed);
  const model = parseOoxmlChart(changed, 'transitional');
  expect(model.title).toBe('North\n4\n2\nSouth');
  expect(model.titleText?.[0]?.runs.at(-1)?.style?.italic).toBe(true);
  expect(model.titleText?.[1]?.runs[0]?.style?.italic).toBe(true);
  expect(xml.match(/id="\{58F21D69-5273-4DAC-91F4-A80D598243B0\}"/g)).toHaveLength(1);
  expect(xml.match(/first-end/g)).toHaveLength(1);
  expect(xml.match(/second-end/g)).toHaveLength(1);
});

test('deleting native line and paragraph breaks merges text without resetting surviving styles', () => {
  const changed = updateChartTitle(source(), 'North42South');
  const model = parseOoxmlChart(changed, 'transitional');
  expect(model.title).toBe('North42South');
  expect(model.titleText).toHaveLength(1);
  expect(model.titleText?.[0]?.runs[0]?.style?.bold).toBe(true);
  expect(model.titleText?.[0]?.runs.at(-1)?.style?.underline).toBe('double');
  expect(model.titleText?.[0]?.alignment).toBe('start');
});

test('new multiline titles use native paragraphs and preserve empty lines', () => {
  const bytes = createOoxmlChart({ type: 'pieChart', categories: [], series: [] });
  const changed = updateChartTitle(bytes, 'One\n\nThree\n');
  const parsed = parseOoxmlChart(changed, 'transitional');
  expect(parsed.title).toBe('One\n\nThree\n');
  expect(parsed.titleText).toHaveLength(4);
});

test('typing just before a native break keeps the break separate from inserted text', () => {
  const changed = updateChartTitle(source(), 'Northbound\n42\nSouth');
  const parsed = parseOoxmlChart(changed, 'transitional');
  expect(parsed.title).toBe('Northbound\n42\nSouth');
  expect(parsed.titleText?.[0]?.runs.map(run => run.text)).toEqual(['Northbound', '\n', '42']);
  expect(parsed.titleText?.[0]?.runs[0]?.style?.bold).toBe(true);
  expect(parsed.titleText?.[0]?.runs[1]?.sourceWrapper?.localName).toBe('br');
});

test('plain replacement keeps Unicode pairs, prefix and suffix run styles', () => {
  const original: readonly ChartTextParagraph[] = [{ runs: [{ text: '😀North', style: { bold: true } }, { text: '\n' }, { text: 'South😺', style: { italic: true } }] }];
  const changed = replacePlainChartTitle(original, '😁East\nSouth😸');
  expect(changed.map(paragraph => paragraph.runs.map(run => run.text).join('')).join('\n')).toBe('😁East\nSouth😸');
  expect(changed.flatMap(paragraph => paragraph.runs).every(run => run.text.isWellFormed())).toBe(true);
  expect(changed[0]?.runs[0]?.style?.bold).toBe(true);
});

test('unchanged multiline text keeps its source paragraph objects', () => {
  const paragraphs = parseOoxmlChart(source(), 'transitional').titleText!;
  expect(replacePlainChartTitle(paragraphs, 'North\n42\nSouth') === paragraphs).toBe(true);
  const once = updateChartTitle(source(), 'North\n42\nSouth');
  expect(decode(updateChartTitle(once, 'North\n42\nSouth'))).toBe(decode(once));
});

test('clearing a styled title retains the insertion style for subsequent typing', () => {
  const empty = updateChartTitle(source(), '');
  const changed = updateChartTitle(empty, 'Rewritten');
  expect(parseOoxmlChart(changed, 'transitional').titleText?.[0]?.runs[0]?.style?.bold).toBe(true);
});

test('typing into an empty paragraph uses its template defaults instead of a previous run', () => {
  const created = createOoxmlChart({ type: 'pieChart', categories: [], series: [], title: 'Initial' });
  const paragraphs = '<a:p><a:r><a:rPr b="1"/><a:t>A</a:t></a:r></a:p><a:p><a:pPr><a:defRPr i="1" sz="2400"/></a:pPr></a:p><a:p><a:r><a:t>B</a:t></a:r></a:p>';
  const empty = encode(decode(created).replace(/<a:p\b[\s\S]*?<\/a:p>/, paragraphs));
  const changed = updateChartTitle(empty, 'A\nX\nB'), parsed = parseOoxmlChart(changed, 'transitional');
  expect(parsed.titleText?.[1]?.runs[0]?.style).toMatchObject({ italic: true, fontSize: 24 });
  expect(parsed.titleText?.[1]?.runs[0]?.style?.bold).toBeUndefined();
});

test('disjoint replacements retain unchanged interior fields and paragraph formatting', () => {
  const changed = updateChartTitle(source(), 'East\n42\nWest'), parsed = parseOoxmlChart(changed, 'transitional');
  expect(parsed.title).toBe('East\n42\nWest');
  expect(parsed.titleText?.[0]?.runs.find(run => run.text === '42')?.sourceWrapper?.localName).toBe('fld');
  expect(parsed.titleText?.[1]?.runs[0]?.style?.underline).toBe('double');
  expect(parsed.titleText?.[1]?.alignment).toBe('end');
  expect(decode(changed)).toContain('first-end');
  expect(decode(changed)).toContain('second-end');
});

test('CRLF and explicit carriage returns survive XML serialization without extra newlines', () => {
  for (const text of ['One\r\nTwo', 'One\rTwo', 'One\nTwo']) {
    const changed = updateChartTitle(source(), text);
    expect(parseOoxmlChart(changed, 'transitional').title).toBe(text);
  }
});

test('typing after a trailing native break retains that break and its insertion style', () => {
  const created = createOoxmlChart({ type: 'pieChart', categories: [], series: [], title: 'Initial' });
  const paragraph = '<a:p><a:r><a:rPr b="1"/><a:t>A</a:t></a:r><a:br><a:rPr i="1" sz="2400"/></a:br></a:p>';
  const trailing = encode(decode(created).replace(/<a:p\b[\s\S]*?<\/a:p>/, paragraph));
  const changed = updateChartTitle(trailing, 'A\nB'), parsed = parseOoxmlChart(changed, 'transitional');
  expect(parsed.title).toBe('A\nB');
  expect(parsed.titleText?.[0]?.runs[1]?.sourceWrapper?.localName).toBe('br');
  expect(parsed.titleText?.[0]?.runs[2]?.style).toMatchObject({ italic: true, fontSize: 24 });
});

test('plain edits at run, line and paragraph boundaries preserve the requested text', () => {
  const paragraphs = parseOoxmlChart(source(), 'transitional').titleText!;
  const original = 'North\n42\nSouth';
  for (let start = 0; start <= original.length; start += 2) for (let end = start; end <= original.length; end += 3) for (const inserted of ['', 'X', '\n', '😀\nZ']) {
    const expected = original.slice(0, start) + inserted + original.slice(end);
    const changed = replacePlainChartTitle(paragraphs, expected);
    expect(changed.map(paragraph => paragraph.runs.map(run => run.text).join('')).join('\n')).toBe(expected);
    expect(changed.flatMap(paragraph => paragraph.runs).every(run => run.text.isWellFormed())).toBe(true);
  }
});
