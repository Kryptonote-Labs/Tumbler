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
