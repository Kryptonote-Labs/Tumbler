import { expect, test } from 'bun:test';
import { layoutWordDocument, NativeWordDocument, openWordArtifact } from '../src/index.ts';
import { lineDocument, fixedMeasurer } from './line-layout-fixture.ts';

test('justification expands inter-word spaces while preserving logical offsets', () => {
  const lines = layoutWordDocument(lineDocument('one two three four five six seven', '<w:jc w:val="both"/>'), fixedMeasurer).pages[0]!.columns[0]!.lines;
  expect(lines.map(line => line.width)).toEqual([100, 70]);
  const first = lines[0]!;
  expect(first.fragments.map(f => f.text).join('')).toBe('one two three four');
  expect(first.fragments.filter(f => f.wordSpacing).map(f => f.wordSpacing)).toEqual([10 / 3, 10 / 3, 10 / 3]);
  for (const [index, fragment] of first.fragments.entries()) {
    expect(fragment.text).toBe('one two three four'.slice(fragment.startOffset, fragment.endOffset));
    if (index > 0) expect(fragment.x).toBeCloseTo(first.fragments[index - 1]!.x + first.fragments[index - 1]!.width);
  }
  expect(first.fragments.at(-1)!.x + first.fragments.at(-1)!.width).toBeCloseTo(first.x + 100);
  expect(lines[1]!.fragments).toHaveLength(1);
});

test('justify leaves final lines and unspaced words alone, but expands explicit line breaks', () => {
  for (const text of ['one two', 'aaaaaaaaaaaaaaaaaaaaa']) {
    const lines = layoutWordDocument(lineDocument(text, '<w:jc w:val="both"/>'), fixedMeasurer).pages[0]!.columns[0]!.lines;
    expect(lines.flatMap(line => line.fragments).some(f => f.wordSpacing)).toBe(false);
  }
  const lines = layoutWordDocument(lineDocument('<w:t>one two</w:t><w:br/>', '<w:jc w:val="both"/>', 100, true), fixedMeasurer).pages[0]!.columns[0]!.lines;
  expect(lines[0]!.width).toBe(100);
  expect(lines[1]!.width).toBe(0);
});

test('doNotExpandShiftReturn controls only soft-break lines', () => {
  for (const [setting, width] of [['<w:doNotExpandShiftReturn/>', 35], ['<w:doNotExpandShiftReturn w:val="false"/>', 100], ['', 100]] as const) {
    const document = lineDocument('<w:t>one two</w:t><w:br/><w:t>three</w:t>', '<w:jc w:val="both"/>', 100, true, setting);
    const lines = layoutWordDocument(document, fixedMeasurer).pages[0]!.columns[0]!.lines;
    expect(lines[0]!.width).toBe(width);
    expect(lines[1]!.width).toBe(25);
    const model = new NativeWordDocument({ source: openWordArtifact(document.bytes()) });
    for (let repeat = 0; repeat < 2; repeat++) {
      expect(model.layout(fixedMeasurer).pages[0]!.columns[0]!.lines[0]!.width).toBe(width);
    }
  }
});

test('new native headers and footers inherit soft-break compatibility through export and caching', () => {
  for (const kind of ['header', 'footer'] as const) {
    const document = lineDocument('body', '', 100, false, '<w:doNotExpandShiftReturn/>');
    const model = new NativeWordDocument({ source: openWordArtifact(document.bytes()) });
    const story = model.updateStory({ section: 0, kind, type: 'default' }, [
      { kind: 'paragraph', alignment: 'justify', runs: [{ text: 'one two' }, { text: '\u2028', breakType: 'line' }, { text: 'three' }] },
    ]);
    expect(story.doNotExpandShiftReturn).toBe(true);
    for (let repeat = 0; repeat < 2; repeat++) {
      const native = model.layout(fixedMeasurer).pages[0]!;
      const exported = layoutWordDocument(model.artifact().document, fixedMeasurer).pages[0]!;
      const nativeLines = kind === 'header' ? native.headerLines : native.footerLines;
      const exportedLines = kind === 'header' ? exported.headerLines : exported.footerLines;
      expect(nativeLines.map(line => line.width)).toEqual([35, 25]);
      expect(nativeLines.map(line => line.width)).toEqual(exportedLines.map(line => line.width));
    }
  }
});
