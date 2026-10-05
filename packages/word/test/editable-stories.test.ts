import { describe, expect, test } from 'bun:test';
import { createWordArtifact, createWordStory, importWordContent, NativeWordDocument, openWordArtifact, reconcileWordContent, wordStoryArtifact } from '../src/index.ts';
const measure = { measure: (text: string) => ({ width: text.length * 5, ascent: 8, descent: 2 }) };

describe('editable header/footer stories', () => {
  test('creates, formats, lays out and exports a header without changing body content', () => {
    const original = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Body text' }] }] });
    const created = createWordStory(original, { kind: 'header', type: 'default', section: 0 });
    const model = new NativeWordDocument({ source: created.artifact });
    model.updateStory(created.partName, [{ kind: 'paragraph', runs: [{ text: 'Shared heading', format: { bold: true } }] }]);
    const layout = model.layout(measure);
    expect(layout.pages[0]!.headerLines.flatMap(line => line.fragments).map(f => f.text).join('')).toBe('Shared heading');
    expect(layout.pages[0]!.headerStory?.relationshipId).toBeDefined();
    const exported = openWordArtifact(model.artifact().bytes());
    expect(importWordContent(exported)).toEqual(importWordContent(created.artifact));
    const header = importWordContent(wordStoryArtifact(exported, created.partName))[0]!;
    expect(header.kind).toBe('paragraph');
    if (header.kind === 'paragraph') { expect(header.runs[0]!.text).toBe('Shared heading'); expect(header.runs[0]!.format?.bold).toBe(true); }
  });
  test('adds an initially missing footer through the native engine', () => {
    const model = new NativeWordDocument();
    model.update([{ kind: 'paragraph', runs: [{ text: 'Body' }] }]);
    model.updateStory({ kind: 'footer', type: 'default', section: 0 }, [{ kind: 'paragraph', runs: [{ text: 'Footer' }] }]);
    expect(model.layout(measure).pages[0]!.footerLines[0]!.fragments[0]!.text).toBe('Footer');
    const exported = openWordArtifact(model.artifact().bytes());
    expect(exported.document.headerFooters).toHaveLength(1);
    expect(exported.document.headerFooters[0]!.kind).toBe('footer');
  });
  test('retains source formatting when editing a story', () => {
    const created = createWordStory(createWordArtifact(), { kind: 'footer', type: 'default', section: 0 });
    const first = reconcileWordContent(wordStoryArtifact(created.artifact, created.partName), [{ kind: 'paragraph', alignment: 'center', runs: [{ text: 'Before', format: { italic: true } }] }]);
    const content = importWordContent(first);
    const paragraph = content[0]!;
    if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
    const result = reconcileWordContent(first, [{ ...paragraph, runs: paragraph.runs.map(run => ({ ...run, text: 'After' })) }]);
    expect(result.document.part.name.value).toBe(created.partName);
    expect(importWordContent(result)[0]).toMatchObject({ alignment: 'center', runs: [{ text: 'After', format: { italic: true } }] });
  });
});

import { buildWordDocumentFixture } from './document-fixture.ts';
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

test('creates a story when an imported document omits section properties and relationships', () => {
  const source = openWordArtifact(buildWordDocumentFixture());
  const created = createWordStory(source, { section: 0, kind: 'header', type: 'default' });
  expect(created.artifact.document.headerFooters).toHaveLength(1);
  expect(created.artifact.document.source.root.localName).toBe('document');
});

test('editing a shared story preserves page fields, tables and inherited section references', () => {
  const source = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${w}" xmlns:r="${r}"><w:body><w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="header"/></w:sectPr></w:pPr><w:r><w:t>First section</w:t></w:r></w:p><w:p><w:r><w:t>Second section</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
    relationships: [{ id: 'header', type: `${r}/header`, target: 'header.xml' }],
    parts: [{ itemName: 'word/header.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml', xml: `<w:hdr xmlns:w="${w}"><w:tbl><w:tblGrid><w:gridCol w:w="5000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Heading</w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:tc></w:tr></w:tbl></w:hdr>` }],
  }));
  const view = wordStoryArtifact(source, '/word/header.xml');
  const content = importWordContent(view);
  const table = content[0]!;
  if (table.kind !== 'table') throw new Error('Expected table');
  const cell = table.rows[0]![0]!;
  const paragraph = cell.blocks[0]!;
  if (paragraph.kind !== 'paragraph') throw new Error('Expected paragraph');
  const blocks = [{ ...table, rows: [[{ ...cell, blocks: [{ ...paragraph, runs: paragraph.runs.map(run => ({ ...run, text: run.text.replace('Heading', 'Changed') })) }] }]] }];
  const model = new NativeWordDocument({ source });
  model.updateStory('/word/header.xml', blocks);
  const layout = model.layout(measure);
  expect(layout.pages).toHaveLength(2);
  expect(layout.pages.map(page => page.headerStory?.relationshipId)).toEqual(['header', 'header']);
  expect(layout.pages.map(page => page.headerStory?.section)).toEqual([0, 0]);
  expect(layout.pages[1]!.headerTables[0]!.cells[0]!.lines[0]!.fragments[0]!.text).toBe('Changed');
  const exported = model.artifact();
  const xml = wordStoryArtifact(exported, '/word/header.xml').document.source.source;
  expect(xml).toContain('w:instr="PAGE"');
  expect(xml).toContain('Changed');
  expect(exported.document.finalSection.headerReferences).toHaveLength(0);
});

test('story text and formatting operations keep their part scope', () => {
  const created = createWordStory(createWordArtifact(), { section: 0, kind: 'header', type: 'default' });
  const source = reconcileWordContent(wordStoryArtifact(created.artifact, created.partName), [{ kind: 'paragraph', runs: [{ text: 'Heading' }] }]);
  const p = source.document.blocks[0]!;
  if (p.kind !== 'paragraph') throw new Error('Expected paragraph');
  const edited = source.replaceText({ anchor: { paragraphElementId: p.elementId, offset: 0 }, focus: { paragraphElementId: p.elementId, offset: 7 } }, 'Revised');
  expect(edited.document.part.name.value).toBe(created.partName);
  expect(importWordContent(edited)[0]).toMatchObject({ runs: [{ text: 'Revised' }] });
});

test('growing headers and footers reserve body space before pagination', () => {
  const model = new NativeWordDocument();
  model.update(Array.from({ length: 100 }, () => ({ kind: 'paragraph' as const, runs: [{ text: 'Body paragraph' }] })));
  const story = Array.from({ length: 12 }, () => ({ kind: 'paragraph' as const, runs: [{ text: 'Story paragraph' }] }));
  model.updateStory({ section: 0, kind: 'header', type: 'default' }, story);
  model.updateStory({ section: 0, kind: 'footer', type: 'default' }, story);
  const layout = model.layout(measure);
  expect(layout.pages.length).toBeGreaterThan(1);
  for (const page of layout.pages) {
    const headerBottom = Math.max(...page.headerLines.map(line => line.y + line.height));
    const footerTop = Math.min(...page.footerLines.map(line => line.y));
    for (const column of page.columns) {
      expect(column.y).toBeGreaterThanOrEqual(headerBottom);
      expect(column.y + column.height).toBeLessThanOrEqual(footerTop);
      for (const line of column.lines) {
        expect(line.y).toBeGreaterThanOrEqual(headerBottom);
        expect(line.y + line.height).toBeLessThanOrEqual(footerTop);
      }
    }
  }
});

test('story images and numbering round-trip through their own relationships', () => {
  const created = createWordStory(createWordArtifact(), { section: 0, kind: 'header', type: 'default' });
  const image = { bytes: new Uint8Array([137, 80, 78, 71]), contentType: 'image/png' as const, width: 30, height: 20 };
  const first = reconcileWordContent(wordStoryArtifact(created.artifact, created.partName), [
    { kind: 'paragraph', list: { id: 'header-list', kind: 'decimal' }, runs: [{ text: 'Numbered' }] },
    { kind: 'paragraph', runs: [{ text: '\uFFFC', image }] },
  ]);
  const blocks = importWordContent(first);
  const edited = reconcileWordContent(first, blocks.map(block => block.kind === 'paragraph' ? { ...block, runs: block.runs.map(run => first.document.drawings.has(run.source!) ? { ...run, image: { ...image, width: 60, height: 40 } } : run) } : block));
  expect(edited.document.part.name.value).toBe(created.partName);
  const drawing = [...edited.document.drawings.values()][0]!;
  expect(drawing.widthPoints).toBe(60);
  expect(drawing.heightPoints).toBe(40);
  const reopened = openWordArtifact(edited.bytes());
  expect(reopened.document.drawings.size).toBe(0);
  expect(reopened.document.headerFooters[0]!.drawings.size).toBe(1);
  expect(importWordContent(wordStoryArtifact(reopened, created.partName))[0]).toMatchObject({ list: { kind: 'decimal' } });
});


test('new inherited stories keep the defining section as their editing target', () => {
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${w}"><w:body><w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>First</w:t></w:r></w:p><w:p><w:r><w:t>Second</w:t></w:r></w:p><w:sectPr/></w:body></w:document>` }));
  const model = new NativeWordDocument({ source });
  model.updateStory({ section: 0, kind: 'header', type: 'default' }, [{ kind: 'paragraph', runs: [{ text: 'Shared new header' }] }]);
  const pages = model.layout(measure).pages;
  expect(pages).toHaveLength(2);
  expect(pages[1]!.headerStory).toEqual(pages[0]!.headerStory);
  expect(pages[1]!.headerLines[0]!.fragments[0]!.text).toBe('Shared new header');
});


test('an oversized repeated story reports overlap without displacing body text off-page', () => {
  const model = new NativeWordDocument();
  model.update([{ kind: 'paragraph', runs: [{ text: 'Body remains on-page' }] }]);
  model.updateStory({ section: 0, kind: 'header', type: 'default' }, Array.from({ length: 100 }, () => ({ kind: 'paragraph' as const, runs: [{ text: 'Oversized header' }] })));
  const page = model.layout(measure).pages[0]!;
  expect(page.storyOverflow).toBe(true);
  expect(page.columns[0]!.lines[0]!.y + page.columns[0]!.lines[0]!.height).toBeLessThan(page.height);
  expect(page.headerLines).toHaveLength(100);
  expect(importWordContent(wordStoryArtifact(model.artifact(), model.artifact().document.headerFooters[0]!.part.name.value))).toHaveLength(100);
});
