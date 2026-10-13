import { expect, test } from 'bun:test';
import { createWordArtifact, importWordContent, NativeWordDocument } from '../src/index.ts';

test('author, change and remove links without changing neighbouring text', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Visit', link: 'https://example.com?a=1&b=2', format: { bold: true } }, { text: ' plain' }] }] });
  const blocks = importWordContent(source);
  const first = blocks[0]!;
  if (first.kind !== 'paragraph') throw Error('paragraph');
  expect(first.runs[0]!.link).toBe('https://example.com?a=1&b=2');
  for (const link of ['https://openai.com', '#bookmark', '']) {
    const native = new NativeWordDocument({ source });
    native.update([{ ...first, runs: [{ ...first.runs[0]!, link }, ...first.runs.slice(1)] }]);
    const result = importWordContent(native.artifact())[0]!;
    if (result.kind !== 'paragraph') throw Error('paragraph');
    expect(result.runs[0]!.link ?? '').toBe(link);
    expect(result.runs[0]!.format?.bold).toBe(true);
    expect(result.runs.map(run => run.text).join('')).toBe('Visit plain');
  }
});

test('new links in imported plain text use remapped package relationships', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Link' }] }] });
  const first = importWordContent(source)[0]!;
  if (first.kind !== 'paragraph') throw Error('paragraph');
  const native = new NativeWordDocument({ source });
  native.update([{ ...first, runs: [{ ...first.runs[0]!, link: 'mailto:alex@example.com' }] }]);
  expect(importWordContent(native.artifact())[0]).toMatchObject({ runs: [{ text: 'Link', link: 'mailto:alex@example.com' }] });
});

test('relative and custom hyperlink targets survive edits without unused relationships', () => {
  for (const link of ['Annual Report.docx', 'file:///tmp/report.docx', 'ftp://example.com/report', '#bookmark']) {
    let source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Link', link }, { text: ' plain' }] }] });
    for (let index = 0; index < 3; index++) {
      const block = importWordContent(source)[0]!;
      if (block.kind !== 'paragraph') throw new Error('Expected paragraph');
      const model = new NativeWordDocument({ source });
      model.update([{ ...block, runs: [block.runs[0]!, { ...block.runs[1]!, text: ` edit ${index}` }] }]);
      source = model.artifact();
      expect(importWordContent(source)[0]).toMatchObject({ runs: [{ text: 'Link', link }, { text: ` edit ${index}` }] });
      expect(source.document.package.relationships(source.document.part.name).items.filter(rel => rel.type.endsWith('/hyperlink'))).toHaveLength(link.startsWith('#') ? 0 : 1);
    }
  }
});
