import { expect, test } from 'bun:test';
import { NativeWordDocument, createWordArtifact, importWordContent } from '../src/index.ts';

for (const styleId of [undefined, 'Heading1']) {
  test(`native paragraph reset matches export with ${styleId ?? 'default'} style`, () => {
    const source = createWordArtifact({ paragraphs: [{
      ...(styleId === undefined ? {} : { styleId }),
      paragraph: {
        keepNext: false, shading: '#FFFF00', spacingBeforeTwips: 480,
        spacingAfterTwips: 600, lineSpacing: { rule: 'exact', value: 500 },
      },
      alignment: 'end', positioning: { indentStartTwips: 720 },
      runs: [{ text: 'Reset', format: { bold: true } }],
    }] });
    const original = importWordContent(source)[0];
    if (original?.kind !== 'paragraph') throw new Error('Missing paragraph');
    const model = new NativeWordDocument({ source });
    const content = { ...original, resetParagraphFormat: true, paragraph: { spacingAfterTwips: 120 } };
    model.update([content]);
    const paragraph = model.blocks[0];
    if (paragraph?.kind !== 'paragraph') throw new Error('Missing paragraph');
    const output = model.artifact().document;
    const exported = output.blocks[0];
    if (exported?.kind !== 'paragraph') throw new Error('Missing exported paragraph');
    const actual = model.paragraphFormat(paragraph);
    expect(actual).toEqual(output.styles.paragraphFormat(output, exported));
    expect(actual).toMatchObject({ alignment: 'end', indentStartTwips: 720, spacingAfterTwips: 120 });
    expect(actual.shading).toBeUndefined();
    expect(model.runFormat(paragraph, paragraph.inlines[0]?.kind === 'run' ? paragraph.inlines[0] : undefined).bold).toBe(true);
  });
}
