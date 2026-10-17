import { expect, test } from 'bun:test';
import { readOfficeInk, replaceOfficeInkTrace, renderOfficeInkSvg } from '../src/index.ts';
import { bytes, officeInk } from './fixture.ts';
const annotation = (alternatives = '') => `<annotationXML><emma:emma xmlns:emma="http://www.w3.org/2003/04/emma"><emma:interpretation id="{11111111-2222-3333-4444-555555555555}" emma:mode="ink"><ms:context xmlns:ms="http://schemas.microsoft.com/ink/2010/main" type="inkWord"/></emma:interpretation>${alternatives}</emma:emma></annotationXML>`;
const choices = '<emma:one-of disjunction-type="recognition"><emma:interpretation emma:confidence="0.9"><emma:literal>hello</emma:literal></emma:interpretation><emma:interpretation emma:confidence="0.5"><emma:literal>hallo</emma:literal></emma:interpretation></emma:one-of>';
const grouped = (metadata: string) => officeInk().replace('<trace xml:id', `<traceGroup>${metadata}<trace xml:id`).replace('</trace>', '</trace></traceGroup>');

test('Office EMMA exposes context and confidence-ordered alternatives without losing source metadata', () => {
  const ink = readOfficeInk(bytes(grouped(annotation(choices))));
  expect(ink.recognition[0]?.diagnostics).toEqual([]);
  expect(ink.recognition[0]?.alternatives.map(choice => [choice.text, choice.confidence])).toEqual([['hello', .9], ['hallo', .5]]);
  expect(ink.recognition[0]?.context?.localName).toBe('context');
  expect(ink.recognition[0]?.id).toBe('{11111111-2222-3333-4444-555555555555}');
  const contextOnly = readOfficeInk(bytes(grouped(annotation())));
  expect(contextOnly.recognition[0]?.diagnostics).toEqual([]);
});

test('invalid recognition is diagnosed separately from valid ink geometry', () => {
  const ink = readOfficeInk(bytes(grouped(annotation(choices.replace('0.5', '0.99')))));
  expect(ink.recognition[0]?.diagnostics).toHaveLength(1);
  expect(renderOfficeInkSvg(ink).supported).toBe(true);
});

test('stroke edits invalidate ancestor recognition but retain unrelated groups and foreign metadata', () => {
  const xml = grouped(annotation(choices)).replace('</ink>', `<traceGroup>${annotation(choices)}<annotationXML><custom:keep/></annotationXML></traceGroup></ink>`);
  const ink = readOfficeInk(bytes(xml));
  const edited = replaceOfficeInkTrace(ink, ink.traces[0]!.elementId, [[0, 1000], [1000, 0]]);
  expect(edited.recognition.filter(item => item.context)).toHaveLength(1);
  expect(edited.recognition[0]?.alternatives[0]?.text).toBe('hello');
  expect(edited.source.source).toContain('<custom:keep/>');
});

test('host device defaults supply omitted calibration and explicit file properties take precedence', () => {
  const defaults = { X: { resolution: 1000, resolutionUnits: '1/in' }, Y: { resolution: 1000, resolutionUnits: '1/in' } };
  const missing = readOfficeInk(bytes(officeInk({ properties: '' })));
  expect(renderOfficeInkSvg(missing).supported).toBe(false);
  const result = renderOfficeInkSvg(missing, { channelDefaults: defaults });
  expect(result.supported && result.traceBounds.width).toBe(72);
  const explicit = renderOfficeInkSvg(readOfficeInk(bytes(officeInk())), { channelDefaults: defaults });
  expect(explicit.supported && explicit.traceBounds.width).toBeCloseTo(72 / 2.54);
});
