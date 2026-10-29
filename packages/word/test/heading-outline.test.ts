import { expect, test } from 'bun:test';
import {
  NativeWordDocument,
  createWordArtifact,
  openWordArtifact,
  wordHeadingOutline,
} from '../src/index.ts';
import { beginPackageTransaction } from '../../opc/src/index.ts';

const paragraph = (text: string, styleId?: string) => ({
  kind: 'paragraph' as const,
  runs: [{ text }],
  ...(styleId ? { styleId } : {}),
});

test('outline follows semantic heading levels and retains positions after table content', () => {
  const model = new NativeWordDocument({
    content: [
      paragraph('Title', 'Title'),
      paragraph('Overview', 'Heading1'),
      { kind: 'table', rows: [[{ blocks: [paragraph('Table heading', 'Heading2')] }]] },
      paragraph('Details', 'Heading3'),
      paragraph('Body'),
    ],
  });
  const headings = wordHeadingOutline(model);
  expect(headings.map((h) => [h.text, h.level])).toEqual([
    ['Overview', 1],
    ['Details', 3],
  ]);
  expect(headings[1]!.start).toBe(model.paragraphs().find((p) => p.text === 'Details')!.start);
  expect(
    wordHeadingOutline(
      new NativeWordDocument({ source: openWordArtifact(model.artifact().bytes()) }),
    ),
  ).toEqual(headings);
});

test('imported custom heading styles inherit outline levels and direct body level suppresses navigation', () => {
  const original = createWordArtifact({
    paragraphs: [
      { runs: [{ text: 'Custom topic' }], styleId: 'ChildHeading' },
      {
        runs: [{ text: 'Body override' }],
        styleId: 'ChildHeading',
        paragraph: { outlineLevel: 9 },
      },
    ],
  });
  const name = original.document.styles.partName!;
  const styles = new TextDecoder().decode(
    original.document.package.readPart(original.document.package.getPart(name)!),
  );
  const updated = styles.replace(
    '</w:styles>',
    '<w:style w:type="paragraph" w:styleId="CustomHeading"><w:name w:val="Topic"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="ChildHeading"><w:basedOn w:val="CustomHeading"/></w:style></w:styles>',
  );
  const transaction = beginPackageTransaction(original.document.package);
  transaction.replacePart(name, new TextEncoder().encode(updated));
  const model = new NativeWordDocument({ source: openWordArtifact(transaction.commit()) });
  expect(wordHeadingOutline(model).map((h) => [h.text, h.level])).toEqual([['Custom topic', 2]]);
  const reopened = new NativeWordDocument({ source: openWordArtifact(model.artifact().bytes()) });
  expect(wordHeadingOutline(reopened)).toEqual(wordHeadingOutline(model));
});
