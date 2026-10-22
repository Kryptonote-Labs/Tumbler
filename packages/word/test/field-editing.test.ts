import { expect, test } from 'bun:test';
import { createWordArtifact, openWordArtifact, layoutWordDocument } from '../src/index.ts';
import { openWordOperationDocument, prepareWordOperation } from '../src/operations/index.ts';
import type { TextAttributes } from '../src/collaboration/formatting.ts';
import { complexField, deleteField, firstParagraph, fieldArtifact, textRun, visible } from './field-editing-fixture.ts';

for (const field of ['PAGE', 'NUMPAGES']) {
  for (const kind of ['simple', 'complex', 'empty complex']) test(`direct deletion removes entire ${kind} ${field} and keeps neighbors`, () => {
    const markup = kind === 'simple' ? `<w:fldSimple w:instr="${field}">${textRun('12')}</w:fldSimple>`
      : complexField(field, kind === 'complex' ? textRun('1') + textRun('2') : '');
    const source = fieldArtifact(`<w:p>${textRun('L')}${markup}${textRun('R')}</w:p>`);
    expect(visible(source)).toBe('L\uFFFCR');
    const edited = deleteField(source);
    expect(visible(openWordArtifact(edited.bytes()))).toBe('LR');
    expect(edited.document.source.source).not.toMatch(/fldChar|instrText|fldSimple/);
  });
  for (const backwards of [false, true]) test(`move ${field} ${backwards ? 'backward' : 'forward'} retains semantics and formatting`, () => {
    const object = { text: '\uFFFC', field: field as 'PAGE' | 'NUMPAGES', format: { italic: true } };
    const source = createWordArtifact({ paragraphs: [{ runs: backwards ? [{ text: 'abc' }, object] : [object, { text: 'abc' }] }] });
    const session = openWordOperationDocument(source);
    try {
      const start = backwards ? 3 : 0;
      session.text.applyDelta(prepareWordOperation(session.text, { start, end: start + 1 }, { name: 'move-object', input: { destination: backwards ? 0 : 4 } }).delta);
      expect(session.text.toString()).toBe(backwards ? '\uFFFCabc\n' : 'abc\uFFFC\n');
      expect((session.text.toDelta() as { insert: string; attributes?: TextAttributes }[]).find(part => part.attributes?.field)?.attributes).toMatchObject({ field, italic: true });
      const saved = session.artifact();
      expect(saved.document.source.source).toContain(`w:instr="${field}"`);
      expect(visible(openWordArtifact(saved.bytes()))).toBe(backwards ? '\uFFFCabc' : 'abc\uFFFC');
    } finally { session.destroy(); }
  });
}

test('nested cached results restore outer result and hide fields nested in instructions', () => {
  const inner = complexField('REF x', textRun('B'));
  const source = fieldArtifact(`<w:p>${complexField('IF', textRun('A') + inner + textRun('C'))}${textRun('D')}</w:p>`);
  expect(visible(source)).toBe('ABCD');
  const instructions = fieldArtifact(`<w:p>${complexField('IF', textRun('A')).replace('<w:r><w:instrText>IF</w:instrText></w:r>', `<w:r><w:instrText>IF</w:instrText></w:r>${inner}`)}${textRun('D')}</w:p>`);
  expect(visible(instructions)).toBe('AD');
});

for (const body of [
  `<w:p>${textRun('one')}</w:p><w:p>${textRun('two')}</w:p>`,
  `<w:tbl><w:tr><w:tc><w:p>${textRun('one')}</w:p></w:tc><w:tc><w:p>${textRun('two')}</w:p></w:tc></w:tr></w:tbl><w:p/>`,
]) test('page number inserts at later paragraph and cell starts', () => {
  const session = openWordOperationDocument(fieldArtifact(body));
  try {
    session.text.applyDelta(prepareWordOperation(session.text, { start: 4, end: 4 }, { name: 'page-number', input: { preset: 'plain' } }).delta);
    expect(session.text.toString()).toStartWith('one\n\uFFFCtwo\n');
    const attributes = (session.text.toDelta() as { insert: string; attributes?: TextAttributes }[]).find(part => part.attributes?.field)?.attributes;
    expect(attributes).toEqual({ field: 'PAGE', bold: false });
    expect(session.artifact().document.source.source).toContain('w:instr="PAGE"');
  } finally { session.destroy(); }
});

test('page number inherits character formatting without cloning neighboring object identity', () => {
  const session = openWordOperationDocument(createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', field: 'NUMPAGES', format: { italic: true, fontSizePoints: 16 } }] }] }));
  try {
    session.text.applyDelta(prepareWordOperation(session.text, { start: 1, end: 1 }, { name: 'page-number', input: { preset: 'plain' } }).delta);
    const attributes = (session.text.toDelta() as { insert: string; attributes?: TextAttributes }[]).find(part => part.attributes?.field === 'PAGE')?.attributes;
    expect(attributes).toMatchObject({ field: 'PAGE', italic: true, fontSize: 16 });
    expect(attributes).not.toHaveProperty('wordSource');
    expect(session.artifact().document.source.source.match(/w:fldSimple/g)?.length).toBe(4);
  } finally { session.destroy(); }
});

test('deleting a complex field within one run retains adjacent text and another field', () => {
  const markup = `${textRun('L')}${complexField('PAGE', textRun('1'))}${textRun('R')}${complexField('NUMPAGES', textRun('9'))}`.replaceAll('</w:r><w:r>', '');
  const edited = deleteField(fieldArtifact(`<w:p>${markup}</w:p>`));
  expect(visible(edited)).toBe('LR\uFFFC');
  expect(edited.document.source.source).not.toContain('>PAGE<');
  expect(edited.document.source.source).toContain('>NUMPAGES<');
});

test('complex field moves across paragraphs without changing the neighboring field', () => {
  const source = fieldArtifact(`<w:p>${complexField('PAGE', textRun('1'))}${textRun('abc')}</w:p><w:p>${complexField('NUMPAGES', textRun('9'))}${textRun('end')}</w:p>`);
  const session = openWordOperationDocument(source);
  try {
    session.text.applyDelta(prepareWordOperation(session.text, { start: 0, end: 1 }, { name: 'move-object', input: { destination: 6 } }).delta);
    expect(session.text.toString()).toBe('abc\n\uFFFC\uFFFCend\n');
    const exported = openWordOperationDocument(openWordArtifact(session.artifact().bytes()));
    try {
      expect((exported.text.toDelta() as { insert: string; attributes?: TextAttributes }[]).filter(part => part.attributes?.field).map(part => part.attributes?.field)).toEqual(['NUMPAGES', 'PAGE']);
    } finally { exported.destroy(); }
  } finally { session.destroy(); }
});

for (const instructionNested of [false, true]) test(`nested field layout offsets match editable text, instruction nesting ${instructionNested}`, () => {
  const inner = complexField('REF x', textRun('B'));
  const outer = instructionNested
    ? complexField('IF', textRun('A')).replace('<w:r><w:instrText>IF</w:instrText></w:r>', `<w:r><w:instrText>IF</w:instrText></w:r>${inner}`)
    : complexField('IF', textRun('A') + inner + textRun('C'));
  const source = fieldArtifact(`<w:p>${outer}${textRun('D')}</w:p>`);
  const fragments = layoutWordDocument(source.document, { measure: text => ({ width: text.length * 6, ascent: 8, descent: 2 }) }).pages.flatMap(page => page.columns.flatMap(column => column.lines.flatMap(line => line.fragments)));
  expect(fragments.map(fragment => fragment.text).join('')).toBe(visible(source));
  const last = fragments.find(fragment => fragment.text === 'D')!;
  expect(last.startOffset).toBe(instructionNested ? 1 : 3);
  expect(last.endOffset).toBe(instructionNested ? 2 : 4);
  const paragraphElementId = firstParagraph(source).elementId;
  const edited = source.replaceText({ anchor: { paragraphElementId, offset: last.startOffset }, focus: { paragraphElementId, offset: last.endOffset } }, '');
  expect(visible(edited)).toBe(instructionNested ? 'A' : 'ABC');
});
