import { expect, test } from 'bun:test';
import { parseLosslessXml, projectLosslessXml } from '../src/index.ts';
const encoder = new TextEncoder();

test('streaming validation preserves namespace semantics, entities and spans across chunk boundaries', () => {
  const xml = `<r xmlns="urn:test" a="${'x'.repeat(4090)}"><c>&amp;&#13;ok</c><!--comment--><![CDATA[text]]></r>`;
  const doc = parseLosslessXml(encoder.encode(xml));
  expect(doc.source).toBe(xml);
  expect(doc.textContent(doc.root)).toBe('&\roktext');
  expect(doc.root.attributes[1]?.value).toHaveLength(4090);
  expect(doc.root.namespaceUri).toBe('urn:test');
});

test('projection consumes complete rows without retaining their lexical nodes', () => {
  const values: string[] = [];
  const depths: number[] = [];
  const doc = projectLosslessXml(encoder.encode('<r><row>one</row><row/><keep>two</keep></r>'), (element, parent, depth) => {
    if (element.localName !== 'row') return true;
    expect(parent?.localName).toBe('r');
    values.push(element.children.map(child => child.kind === 'element' ? '' : child.value).join(''));
    depths.push(depth);
    return false;
  });
  expect(values).toEqual(['one', '']);
  expect(depths).toEqual([1, 1]);
  expect(doc.elements(undefined, 'row')).toHaveLength(0);
  expect(doc.textContent(doc.root)).toBe('two');
});

for (const xml of [
  '<r>' + ' '.repeat(5000) + '<c></r>',
  '<!DOCTYPE r [<!ENTITY x "boom">]><r>&x;</r>',
  '<r>' + ' '.repeat(5000) + '&undefined;</r>',
]) test('streaming validation rejects malformed content including after the final opening tag', () => {
  expect(() => parseLosslessXml(encoder.encode(xml))).toThrow();
  expect(() => projectLosslessXml(encoder.encode(xml), () => false)).toThrow();
});
