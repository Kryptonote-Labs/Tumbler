import assert from 'node:assert/strict';
import { createWordArtifact, createWordStory, importWordContent, NativeWordDocument, openWordArtifact, resolveWordTableGrid, wordParagraphText, wordSections, wordStoryArtifact, type WordArtifact, type WordContentBlock, type WordContentCell } from '../../../packages/word/src/index.ts';
import { buildWordDocumentFixture } from '../../../packages/word/test/document-fixture.ts';
import type { Fixture } from '../scenarios.ts';
const p = (text: string): WordContentBlock => ({ kind: 'paragraph', runs: [{ text }] });
const cell = (text: string): WordContentCell => ({ blocks: [p(text)] });
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'));
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function output(name: string, artifact: WordArtifact, verify: Fixture['verify']): Fixture {
  verify(openWordArtifact(artifact.bytes()));
  return { name, bytes: artifact.bytes(), verify };
}
export const headlessProbes: Readonly<Record<string, () => readonly Fixture[]>> = {
  'formatting.fonts-colours'() {
    const artifact = createWordArtifact({ paragraphs: [{ runs: [{ text: 'left target right' }] }] });
    const id = artifact.document.blocks[0]!.elementId;
    const selection = { anchor: { paragraphElementId: id, offset: 5 }, focus: { paragraphElementId: id, offset: 11 } };
    const edited = artifact.applyFormatting(selection, { text: { fontFamily: { set: 'Arial' }, fontSize: { set: 18 }, color: { set: { type: 'rgb', value: '#123456' } } } });
    const font = edited.formattingState(selection).text.fontFamily;
    assert.ok('value' in font && font.value === 'Arial');
    const size = edited.formattingState(selection).text.fontSize;
    const colour = edited.formattingState(selection).text.color;
    assert.ok('value' in size && size.value === 18);
    assert.ok('value' in colour && colour.value?.type === 'rgb' && colour.value.value === '#123456');
    const model = new NativeWordDocument({ source: edited });
    model.update(importWordContent(edited).map(block => block.kind === 'paragraph' ? { ...block, runs: block.runs.map(run => run.text === 'target' ? { ...run, format: { ...run.format, highlight: 'yellow' } } : run) } : block));
    return [output('selected-highlight', model.artifact(), actual => {
      const block = importWordContent(actual)[0];
      assert.ok(block?.kind === 'paragraph');
      assert.deepEqual(block.runs.map(run => run.text), ['left ', 'target', ' right']);
      const selected = block.runs[1]!.format;
      assert.equal(selected?.fontFamily, 'Arial'); assert.equal(selected?.fontSizePoints, 18);
      assert.equal(selected?.color, '#123456'); assert.equal(selected?.highlight, 'yellow');
      assert.ok(block.runs.filter(run => run.text !== 'target').every(run => !run.format?.highlight || run.format.highlight === 'none'));
    })];
  },
  'formatting.paragraphs'() {
    const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Edit me' }] }, { runs: [{ text: 'Untouched' }] }] });
    const model = new NativeWordDocument({ source });
    const original = importWordContent(source);
    const first = original[0]; assert.ok(first?.kind === 'paragraph');
    return (['start', 'center', 'end', 'justify'] as const).map(alignment => {
      model.update([{ ...first, alignment, positioning: { indentStartTwips: 360, indentEndTwips: 180 }, paragraph: { spacingBeforeTwips: 120, spacingAfterTwips: 240 } }, original[1]!]);
      return output(alignment, model.artifact(), actual => {
        const blocks = actual.document.blocks;
        const edited = blocks[0], untouched = blocks[1];
        assert.ok(edited?.kind === 'paragraph' && untouched?.kind === 'paragraph');
        const format = actual.document.styles.paragraphFormat(actual.document, edited);
        assert.equal(format.alignment, alignment); assert.equal(format.indentStartTwips, 360); assert.equal(format.indentEndTwips, 180);
        assert.equal(format.spacingBeforeTwips, 120); assert.equal(format.spacingAfterTwips, 240);
        const unchanged = source.document.blocks[1]; assert.ok(unchanged?.kind === 'paragraph');
        assert.equal(wordParagraphText(actual.document, untouched), 'Untouched');
        assert.deepEqual(actual.document.styles.paragraphFormat(actual.document, untouched), source.document.styles.paragraphFormat(source.document, unchanged));
      });
    });
  },
  'formatting.styles'() {
    const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Heading' }] }, { runs: [{ text: 'Body' }] }] });
    const model = new NativeWordDocument({ source });
    const blocks = importWordContent(source);
    model.update(blocks.map((block, index) => block.kind === 'paragraph' ? { ...block, styleId: index ? 'Normal' : 'Heading1', runs: block.runs.map(({ format, ...run }) => ({ ...run, ...(index ? { format: { italic: true } } : {}) })) } : block));
    return [output('named-styles', model.artifact(), actual => {
      const paragraphs = actual.document.blocks.filter(block => block.kind === 'paragraph');
      assert.deepEqual(paragraphs.map(block => actual.document.styles.paragraphFormat(actual.document, block).styleId), ['Heading1', 'Normal']);
      const formats = paragraphs.map(block => actual.document.styles.runFormat(actual.document, block, block.inlines[0]?.kind === 'run' ? block.inlines[0] : undefined));
      assert.equal(formats[0]?.fontSizePoints, 20); assert.equal(formats[0]?.bold, true);
      assert.equal(formats[1]?.fontSizePoints, 12); assert.equal(formats[1]?.italic, true);
    })];
  },
  'content.links'() {
    const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'External', link: 'https://example.com/old' }, { text: 'Internal', link: '#old' }] }] });
    const model = new NativeWordDocument({ source });
    model.update(importWordContent(source).map(block => block.kind === 'paragraph' ? { ...block, runs: block.runs.map(run => ({ ...run, link: run.text === 'External' ? 'https://example.com/new' : '#new' })) } : block));
    const verify = (actual: WordArtifact, targets: readonly string[]) => {
      const block = importWordContent(actual)[0]; assert.ok(block?.kind === 'paragraph');
      assert.deepEqual(block.runs.map(run => run.text), ['External', 'Internal']);
      assert.deepEqual(block.runs.map(run => run.link), targets);
    };
    return [output('created', source, actual => verify(actual, ['https://example.com/old', '#old'])), output('edited', model.artifact(), actual => verify(actual, ['https://example.com/new', '#new']))];
  },
  'formatting.lists'() {
    const paragraph = (text: string, id: string, kind: 'bullet' | 'decimal', level = 0, start = 1): WordContentBlock => ({ kind: 'paragraph', runs: [{ text }], list: { id, kind, level, start } });
    let blocks = [paragraph('A', 'a', 'decimal'), paragraph('B', 'a', 'decimal'), paragraph('C', 'b', 'decimal', 0, 5), paragraph('Bullet', 'c', 'bullet')];
    const original = createWordArtifact({ blocks });
    const model = new NativeWordDocument({ source: original });
    const fixtures: Fixture[] = [];
    for (const level of [1, 0]) {
      blocks = [blocks[0]!, paragraph('B', 'a', 'decimal', level), blocks[2]!, blocks[3]!];
      model.update(blocks);
      fixtures.push(output(`level-${level}`, model.artifact(), artifact => {
        const markers = [...artifact.document.numbering.markers(artifact.document).values()];
        assert.deepEqual(markers.map(marker => marker.text), level ? ['1.', '1.', '5.', '•'] : ['1.', '2.', '5.', '•']);
        assert.deepEqual(importWordContent(artifact).map(block => block.kind === 'paragraph' ? block.list?.level : undefined), [0, level, 0, 0]);
      }));
    }
    model.update([blocks[0]!, paragraph('B', 'restart', 'decimal', 0, 8), blocks[2]!, blocks[3]!]);
    fixtures.push(output('restart', model.artifact(), artifact => assert.deepEqual([...artifact.document.numbering.markers(artifact.document).values()].map(marker => marker.text), ['1.', '8.', '5.', '•'])));
    return fixtures;
  },
  'structure.table-edit'() {
    const source = createWordArtifact({ blocks: [p('Before'), { kind: 'table', columnWidths: [100, 100], rows: [[cell('A'), cell('B')], [cell('C'), cell('D')]] }, p('After')] });
    const model = new NativeWordDocument({ source });
    const fixtures: Fixture[] = [];
    const steps: readonly { name: string; rows: readonly (readonly WordContentCell[])[]; widths: readonly number[]; expected: readonly (readonly string[])[] }[] = [
      { name: 'insert-row', rows: [[cell('A'), cell('B')], [cell('X'), cell('Y')], [cell('C'), cell('D')]], widths: [100,100], expected: [['A','B'],['X','Y'],['C','D']] },
      { name: 'insert-column', rows: [[cell('A'),cell('N'),cell('B')],[cell('C'),cell('M'),cell('D')]], widths: [80,80,80], expected: [['A','N','B'],['C','M','D']] },
      { name: 'merge', rows: [[{ ...cell('AB'), gridSpan: 2 }],[cell('C'),cell('D')]], widths: [100,100], expected: [['AB'],['C','D']] },
      { name: 'split-and-delete', rows: [[cell('A'),cell('B')]], widths: [100,100], expected: [['A','B']] },
    ];
    for (const step of steps) {
      model.update([p('Before'), { kind: 'table', columnWidths: step.widths, rows: step.rows }, p('After')]);
      fixtures.push(output(step.name, model.artifact(), artifact => {
        assert.deepEqual(artifact.document.blocks.filter(block => block.kind === 'paragraph').map(block => wordParagraphText(artifact.document, block)), ['Before','After']);
        const table = artifact.document.blocks.find(block => block.kind === 'table');
        assert.ok(table);
        assert.deepEqual(table.rows.map(row => row.cells.map(cell => cell.blocks.filter(block => block.kind === 'paragraph').map(block => wordParagraphText(artifact.document, block)).join(''))), step.expected);
        assert.equal(resolveWordTableGrid(table).columnCount, step.widths.length);
        if (step.name === 'merge') assert.equal(table.rows[0]!.cells[0]!.gridSpan, 2);
      }));
    }
    return fixtures;
  },
  'content.images'() {
    const image = { bytes: png, contentType: 'image/png' as const, width: 72, height: 36, alt: 'Chart <&> description' };
    const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Before' }, { text: '\uFFFC', image }, { text: 'After' }] }] });
    const drawing = [...source.document.drawings.values()][0]!;
    const edited = source.resizeDrawing({ elementId: drawing.elementId, widthPoints: 144, heightPoints: 60 });
    return [output('resized-image', edited, artifact => {
      const content = artifact.document.blocks[0];
      assert.ok(content?.kind === 'paragraph');
      assert.equal(wordParagraphText(artifact.document, content), 'Before\uFFFCAfter');
      const actual = [...artifact.document.drawings.values()][0];
      assert.ok(actual?.kind === 'image');
      assert.equal(actual.placement, 'inline');
      assert.equal(actual.widthPoints, 144); assert.equal(actual.heightPoints, 60); assert.equal(actual.altText, image.alt); assert.deepEqual(actual.bytes, png);
    })];
  },
  'structure.headers'() {
    let artifact = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${w}"><w:body><w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>First</w:t></w:r></w:p><w:p><w:r><w:t>Second</w:t></w:r></w:p><w:sectPr/></w:body></w:document>` }));
    const stories: { part: string; text: string }[] = [];
    for (const kind of ['header', 'footer'] as const) for (const type of ['default', 'first', 'even'] as const) {
      const created = createWordStory(artifact, { kind, type, section: 0 }); artifact = created.artifact;
      stories.push({ part: created.partName, text: `${kind}-${type}` });
    }
    const separate = createWordStory(artifact, { kind: 'header', type: 'first', section: 1 }); artifact = separate.artifact;
    stories.push({ part: separate.partName, text: 'Independent first' });
    const before = wordSections(artifact.document).map(section => ({ headers: section.headerReferences, footers: section.footerReferences }));
    const model = new NativeWordDocument({ source: artifact });
    for (const story of stories) model.updateStory(story.part, [p(story.text)]);
    return [output('edited-stories', model.artifact(), actual => {
      for (const story of stories) assert.deepEqual(importWordContent(wordStoryArtifact(actual, story.part)).map(block => block.kind === 'paragraph' ? block.runs.map(run => run.text).join('') : ''), [story.text]);
      assert.deepEqual(wordSections(actual.document).map(section => ({ headers: section.headerReferences, footers: section.footerReferences })), before);
      assert.deepEqual(actual.document.blocks.filter(block => block.kind === 'paragraph').map(block => wordParagraphText(actual.document, block)), ['First','Second']);
    })];
  },
};
