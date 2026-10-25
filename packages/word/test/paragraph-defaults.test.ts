import { expect, test } from 'bun:test';
import { ThemeColorScheme } from '@tumblerjs/ooxml';
import { createWordArtifact, importWordContent, NativeWordDocument, type CreateWordOptions, type WordContentBlock } from '../src/index.ts';

test('paragraph defaults agree between native layout and DOCX and allow direct overrides', () => {
  const content: readonly WordContentBlock[] = [
    { kind: 'paragraph', runs: [{ text: 'Unstyled' }] },
    { kind: 'paragraph', styleId: 'Normal', runs: [{ text: 'Normal' }] },
    { kind: 'paragraph', styleId: 'Normal', paragraph: { spacingAfterTwips: 0 }, runs: [{ text: 'Override' }] },
  ];
  const options: readonly CreateWordOptions[] = [
    { defaultParagraphFormat: { spacingAfterTwips: 160, lineSpacing: { rule: 'auto', value: 276 } } },
    { defaultParagraphFormat: { spacingAfterTwips: 160 }, lineSpacing: 1.15 },
  ];
  for (const defaults of options) {
    const model = new NativeWordDocument({ ...defaults, content });
    for (const artifact of [model.artifact(), createWordArtifact({ ...defaults, blocks: content })]) {
      expect(artifact.document.styles.resolveParagraphStyle('Normal').paragraph).toMatchObject({
        spacingAfterTwips: 160, lineSpacing: { rule: 'auto', value: 276 },
      });
      for (const [index, block] of model.blocks.entries()) {
        if (block.kind !== 'paragraph') throw new Error('Expected paragraph');
        const format = model.paragraphFormat(block);
        expect(format).toMatchObject({ spacingAfterTwips: index === 2 ? 0 : 160, lineSpacing: { rule: 'auto', value: 276 } });
        const exported = artifact.document.blocks[index];
        if (exported?.kind !== 'paragraph') throw new Error('Expected exported paragraph');
        expect(artifact.document.styles.paragraphFormat(artifact.document, exported)).toEqual(format);
      }
    }
  }
});

test('imported paragraph defaults win over host defaults when editing and adding paragraphs', () => {
  const source = createWordArtifact({ lineSpacing: 2, paragraphs: [{ styleId: 'Normal', runs: [{ text: 'Imported' }] }] });
  const model = new NativeWordDocument({
    source,
    defaultParagraphFormat: { spacingAfterTwips: 160, shading: '#FFFF00', borders: { bottom: { style: 'single', color: '#112233', widthPoints: 1 } } },
  });
  model.update([...importWordContent(source), { kind: 'paragraph', styleId: 'Normal', runs: [{ text: 'Added' }] }, { kind: 'paragraph', runs: [{ text: 'Unstyled addition' }] }]);
  const artifact = model.artifact();
  for (const [index, block] of model.blocks.entries()) {
    if (block.kind !== 'paragraph') throw new Error('Expected paragraph');
    const format = model.paragraphFormat(block);
    expect(format).toMatchObject({ spacingAfterTwips: 0, lineSpacing: { rule: 'auto', value: 480 } });
    expect(format.shading).toBeUndefined();
    expect(format.borders).toBeUndefined();
    const exported = artifact.document.blocks[index];
    if (exported?.kind !== 'paragraph') throw new Error('Expected exported paragraph');
    expect(artifact.document.styles.paragraphFormat(artifact.document, exported)).toEqual(format);
  }
});

test('invalid paragraph defaults fail before native layout or DOCX creation', () => {
  const defaults = { spacingAfterTwips: -1 };
  expect(() => new NativeWordDocument({ defaultParagraphFormat: defaults })).toThrow('Invalid paragraph formatting');
  expect(() => createWordArtifact({ defaultParagraphFormat: defaults })).toThrow('Invalid paragraph formatting');
});

test('named and unstyled paragraph defaults resolve the authored theme in layout and DOCX', () => {
  const model = new NativeWordDocument({
    themeColours: new ThemeColorScheme('Custom', new Map([['accent1', 'FF0000']])),
    defaultParagraphFormat: {
      shading: { theme: 'accent1', fallback: '#156082' },
      borders: { bottom: { style: 'single', color: { theme: 'accent1', fallback: '#156082' }, widthPoints: 1 } },
    },
    content: [
      { kind: 'paragraph', runs: [{ text: 'Unstyled' }] },
      { kind: 'paragraph', styleId: 'Normal', runs: [{ text: 'Normal' }] },
    ],
  });
  const artifact = model.artifact();
  for (const [index, block] of model.blocks.entries()) {
    if (block.kind !== 'paragraph') throw new Error('Expected paragraph');
    const exported = artifact.document.blocks[index];
    if (exported?.kind !== 'paragraph') throw new Error('Expected exported paragraph');
    for (const format of [model.paragraphFormat(block), artifact.document.styles.paragraphFormat(artifact.document, exported)]) {
      expect(format.shading).toBe('#FF0000');
      expect(format.borders?.bottom?.color).toBe('#FF0000');
    }
  }
});
