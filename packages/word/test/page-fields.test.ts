import { expect, test } from 'bun:test';
import { createWordArtifact, importWordContent, NativeWordDocument, openWordArtifact, wordStoryArtifact, type WordContentBlock } from '../src/index.ts';

const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 8, descent: 2 }) };
const field = (kind: 'PAGE' | 'NUMPAGES') => ({ text: '\uFFFC', field: kind, format: { bold: true } });
const footer: WordContentBlock[] = [{ kind: 'paragraph', alignment: 'end', runs: [field('PAGE'), { text: ' of ' }, field('NUMPAGES')] }];
const target = { section: 0, kind: 'footer', type: 'default' } as const;
const body = (count: number): WordContentBlock[] => Array.from({ length: count }, () => ({ kind: 'paragraph', runs: [{ text: 'Body' }] }));
function model() {
  return new NativeWordDocument({ page: { width: 150, height: 100, margin: 20 } });
}
function footerText(document: NativeWordDocument) {
  return document.layout(measure).pages.map(page => page.footerLines.flatMap(line => line.fragments.map(fragment => fragment.text)).join(''));
}

test('shared page fields resolve per page and update after pagination changes', () => {
  const doc = model();
  doc.update(body(20));
  doc.updateStory(target, footer);
  let layout = doc.layout(measure);
  expect(layout.pages.length).toBeGreaterThan(1);
  expect(footerText(doc)).toEqual(layout.pages.map((_, i) => `${i + 1} of ${layout.pages.length}`));
  const line = layout.pages[0]!.footerLines[0]!;
  expect(line.x + line.width).toBeCloseTo(130);
  expect(line.fragments.filter(fragment => fragment.field).map(fragment => fragment.endOffset - fragment.startOffset)).toEqual([1, 1]);
  expect(line.fragments[0]!.format.bold).toBe(true);
  doc.update(body(1));
  expect(footerText(doc)).toEqual(['1 of 1']);
});

test('DOCX round trips retain fields, formatting and surrounding edits', () => {
  const doc = model();
  doc.update(body(10));
  doc.updateStory(target, footer);
  const artifact = openWordArtifact(doc.artifact().bytes());
  const story = artifact.document.headerFooters[0]!;
  const imported = importWordContent(wordStoryArtifact(artifact, story.part.name.value));
  const paragraph = imported[0]!;
  if (paragraph.kind !== 'paragraph') throw new Error('Missing footer');
  expect(paragraph.runs.filter(run => run.field).map(run => run.field)).toEqual(['PAGE', 'NUMPAGES']);
  const reopened = new NativeWordDocument({ source: artifact });
  reopened.updateStory(story.part.name.value, [{ ...paragraph, runs: [{ text: 'Page ' }, ...paragraph.runs] }]);
  const saved = openWordArtifact(reopened.artifact().bytes());
  const xml = wordStoryArtifact(saved, story.part.name.value).document.source.source;
  expect(xml.match(/w:instr="PAGE"/g)).toHaveLength(1);
  expect(xml.match(/w:instr="NUMPAGES"/g)).toHaveLength(1);
  expect(footerText(reopened)[0]).toStartWith('Page 1 of ');
  reopened.updateStory(story.part.name.value, [{ ...paragraph, runs: paragraph.runs.filter(run => !run.field) }]);
  const removed = wordStoryArtifact(reopened.artifact(), story.part.name.value).document.source.source;
  expect(removed).not.toContain('fldSimple');
});

test('page totals in table cells update across the ten-page boundary', () => {
  const doc = model();
  doc.update(body(80));
  doc.updateStory(target, [{ kind: 'table', rows: [[{ blocks: footer }]] }]);
  const layout = doc.layout(measure);
  expect(layout.pages.length).toBeGreaterThanOrEqual(10);
  for (const page of layout.pages) {
    const text = page.footerTables[0]!.cells[0]!.lines.flatMap(line => line.fragments.map(fragment => fragment.text)).join('');
    expect(text).toBe(`${page.index + 1} of ${layout.pages.length}`);
  }
});

test('authored fields reject text that cannot represent a single field', () => {
  expect(() => createWordArtifact({ paragraphs: [{ runs: [{ text: '12', field: 'PAGE' }] }] })).toThrow('object replacement');
});
