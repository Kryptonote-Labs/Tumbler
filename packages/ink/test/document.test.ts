import { expect, test } from 'bun:test';
import { readOfficeInk, replaceOfficeInkTrace, renderOfficeInkSvg } from '../src/index.ts';
import { bytes, officeInk } from './fixture.ts';

test('resolves forward references, nested trace groups, reordered channels and foreign metadata', () => {
  const xml = officeInk({ channels: '<channel name="Y" type="integer"/><channel name="X" type="integer"/>', trace: '2 1' });
  const trace = xml.match(/<trace xml:id[\s\S]*?<\/trace>/)![0];
  const moved = xml.replace(trace, '').replace('  <definitions>', `<traceGroup><traceGroup>${trace}</traceGroup></traceGroup><definitions>`);
  const ink = readOfficeInk(bytes(moved));
  expect(ink.diagnostics).toEqual([]);
  expect(ink.traces[0]?.points).toEqual([[2, 1]]);
  expect(ink.traces[0]?.channels.map(c => c.name)).toEqual(['Y', 'X']);
  expect(ink.source.originalBytes()).toEqual(bytes(moved));
});

test.each([
  ['missing context', 'contextRef="#context"', ''],
  ['external context', 'contextRef="#context"', 'contextRef="https://example.invalid/#context"'],
  ['wrong target', 'contextRef="#context"', 'contextRef="#pen"'],
  ['missing brush', 'brushRef="#pen"', 'brushRef="#absent"'],
  ['missing source id', 'xml:id="device"', ''],
  ['wrong channel type', 'type="integer"', 'type="string"'],
  ['unknown property channel', 'channel="X"', 'channel="absent"'],
  ['reversed range', 'name="X" type="integer"', 'name="X" min="10" max="1"'],
  ['nonfinite range', 'name="X" type="integer"', 'name="X" max="NaN"'],
])('%s produces a diagnostic and prevents partial rendering', (_name, before, after) => {
  const document = readOfficeInk(bytes(officeInk().replace(before!, after!)));
  expect(document.diagnostics.length).toBeGreaterThan(0);
  expect(renderOfficeInkSvg(document).supported).toBe(false);
});

test('reports duplicate ids and rejects malformed XML or caller-defined resource overrun', () => {
  expect(readOfficeInk(bytes(officeInk().replace('xml:id="pen"', 'xml:id="context"'))).diagnostics[0]?.message).toContain('Duplicate');
  expect(() => readOfficeInk(bytes('<ink xmlns="urn:wrong"/>'))).toThrow();
  expect(() => readOfficeInk(bytes('<!DOCTYPE ink [<!ENTITY x "oops">]>' + officeInk()))).toThrow();
  expect(() => readOfficeInk(bytes(officeInk()), { maxElements: 2 })).toThrow();
});

test('Office ignores trace/group inheritance, traceViews and definitions traces', () => {
  const xml = officeInk({ attributes: 'type="penUp" continuation="end" priorRef="#missing"', extra: '<traceView traceDataRef="#missing"/><definitions><trace>bad</trace></definitions>' });
  const document = readOfficeInk(bytes(xml));
  expect(document.diagnostics).toEqual([]);
  expect(document.traces).toHaveLength(1);
  expect(renderOfficeInkSvg(document).supported).toBe(true);
  const missing = readOfficeInk(bytes(xml.replace('contextRef="#context"', '').replace('<trace xml:id', '<traceGroup contextRef="#context"><trace xml:id').replace('</trace>', '</trace></traceGroup>')));
  expect(missing.diagnostics[0]?.code).toBe('reference');
});

test('lossless sample replacement retains unrelated XML, namespaces, attributes and encoding', () => {
  const xml = officeInk({ trace: '0 0, 1000 1000' });
  for (const input of [bytes(xml), new Uint8Array(Buffer.from('\ufeff' + xml, 'utf16le'))]) {
    const document = readOfficeInk(input);
    const edited = replaceOfficeInkTrace(document, document.traces[0]!.elementId, [[2, 3], [4, 5]]);
    expect(edited.source.source).toBe(xml.replace('0 0, 1000 1000', '2 3, 4 5'));
    expect(edited.source.encoding).toBe(document.source.encoding);
    expect(document.source.originalBytes()).toEqual(input);
    expect(edited.traces[0]?.points).toEqual([[2, 3], [4, 5]]);
  }
});

test('editing refuses to erase opaque trace markup', () => {
  const document = readOfficeInk(bytes(officeInk({ trace: '0 0<!-- do not erase -->' })));
  expect(() => replaceOfficeInkTrace(document, document.traces[0]!.elementId, [[1, 2]])).toThrow('opaque');
  expect(() => replaceOfficeInkTrace(document, -1, [[1, 2]])).toThrow('decoded trace');
});

test('brushes at the ink root resolve while contexts still require definitions', () => {
  const xml = officeInk();
  const brush = xml.match(/<brush[\s\S]*?<\/brush>/)![0];
  for (const relocated of [xml.replace(brush, '').replace('</ink>', `${brush}</ink>`), xml.replace(brush, '').replace('</context>', `${brush}</context>`)]) {
    const document = readOfficeInk(bytes(relocated));
    expect(document.diagnostics).toEqual([]);
    expect(document.traces).toHaveLength(1);
    expect(renderOfficeInkSvg(document).supported).toBe(true);
  }
});

test('foreign duplicate IDs are diagnosed globally without discarding unaffected decoded traces', () => {
  const xml = officeInk({ extra: '<annotationXML><custom:a xml:id="foreign"/><custom:b xml:id="foreign"/></annotationXML>' });
  const document = readOfficeInk(bytes(xml));
  expect(document.diagnostics[0]?.code).toBe('reference');
  expect(document.traces).toHaveLength(1);
  expect(document.source.originalBytes()).toEqual(bytes(xml));
  const ambiguous = readOfficeInk(bytes(officeInk({ extra: '<annotationXML><custom:a xml:id="pen"/></annotationXML>' })));
  expect(ambiguous.traces).toHaveLength(0);
  expect(ambiguous.diagnostics.some(d => d.message.includes('unambiguous'))).toBe(true);
});

test('declared-range violations are distinguished from syntax errors without clamping samples', () => {
  const xml = officeInk({ channels: '<channel name="X"/><channel name="Y"/><channel name="F" max="100"/>', trace: '0 0 101' });
  const document = readOfficeInk(bytes(xml));
  expect(document.diagnostics[0]).toMatchObject({ code: 'range' });
  expect(document.diagnostics[0]?.message).toContain('channel F is 101');
  expect(document.traces).toHaveLength(0);
  expect(document.source.originalBytes()).toEqual(bytes(xml));
});
