import { expect, test } from 'bun:test';
import { generate } from '../../../tools/word-strict-resources/generate.ts';
import { importWordContent, openWordArtifact } from '../src/index.ts';
import { reconcileWordContent } from '../src/content-export.ts';
import { tableMeasurementTwips } from '../src/strict-resources.ts';

const strict = 'http://purl.oclc.org/ooxml/wordprocessingml/main';
test('Strict authored resources use target vocabulary and retain table geometry after reopen', () => {
  const artifact = openWordArtifact(generate('strict').bytes());
  const xml = artifact.document.source.source;
  expect(xml).toContain('w:w="200pt"');
  expect(xml).toContain('<w:start');
  expect(xml).not.toContain('<w:left');
  const table = artifact.document.blocks.find(block => block.kind === 'table')!;
  expect(table.width).toEqual({ type: 'dxa', value: 4000 });
  expect(table.rows[0]!.cells[0]!.width).toEqual({ type: 'dxa', value: 4000 });
  expect(table.rows[0]!.cells[0]!.margins).toEqual({ topTwips: 10, endTwips: 20, bottomTwips: 30, startTwips: 40 });
  const resources = artifact.document.package.parts.filter(part => /theme|numbering/.test(part.name.value));
  expect(resources).toHaveLength(2);
  const contents = resources.map(part => new TextDecoder().decode(artifact.document.package.readPart(part)));
  expect(contents.join('')).not.toContain('http://schemas.openxmlformats.org/');
  expect(contents.join('')).toContain('<a:miter lim="800%"');
  expect(contents.join('')).toContain('<w:ind w:start=');
  expect(contents.join('')).toContain('<w:lvlJc w:val="start"');
  expect([...artifact.document.numbering.markers(artifact.document).values()].map(marker => marker.text)).toEqual(['1.']);
  const blocks = importWordContent(artifact);
  const edited = reconcileWordContent(artifact, blocks.map(block => block.kind === 'paragraph'
    ? { ...block, runs: [{ text: 'edited' }] } : block));
  for (const part of resources) expect(edited.document.package.readPart(edited.document.package.getPart(part.name)!)).toEqual(artifact.document.package.readPart(part));
  expect(edited.document.blocks.find(block => block.kind === 'table')!.width).toEqual(table.width);
  // Reapplying imported borders replaces start/end instead of duplicating them.
  const document = edited.document.source;
  const borders = document.elements(strict, 'tcBorders')[0]!;
  expect(borders.children.filter(child => child.kind === 'element' && child.localName === 'start')).toHaveLength(1);
});

test('Transitional resource vocabulary and numeric widths stay unchanged', () => {
  const artifact = generate('transitional');
  expect(artifact.document.source.source).toContain('w:w="4000"');
  expect(artifact.document.source.source).toContain('<w:left');
  const theme = artifact.document.package.parts.find(part => /theme/.test(part.name.value))!;
  expect(new TextDecoder().decode(artifact.document.package.readPart(theme))).toContain('<a:miter lim="800000"');
});

test('Strict physical measurements normalize to twips without accepting malformed units', () => {
  for (const value of ['72pt', '1in', '2.54cm', '25.4mm', '6pc', '6pi'])
    expect(tableMeasurementTwips(value, strict)).toBe('1440');
  expect(tableMeasurementTwips('0.05pt', strict)).toBe('1');
  expect(tableMeasurementTwips('badpt', strict)).toBe('badpt');
});
