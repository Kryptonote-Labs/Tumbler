import { buildWordDocumentFixture } from '../packages/word/test/document-fixture.ts';

const output = Bun.argv[2];
if (!output) throw new Error('Usage: bun scripts/generate-word-line-spacing-fixture.ts <output.docx>');
const paragraphs: string[] = [];
for (const size of [11, 18, 24]) {
  for (const spacing of [240, 276, 480]) {
    for (const face of ['', '<w:b/>', '<w:i/>']) {
      const format = `<w:rFonts w:ascii="Liberation Serif" w:hAnsi="Liberation Serif"/><w:sz w:val="${size * 2}"/>${face}`;
      for (let line = 0; line < 3; line++) {
        paragraphs.push(`<w:p><w:pPr>${paragraphs.length > 0 && line === 0 ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="0" w:line="${spacing}" w:lineRule="auto"/><w:rPr>${format}</w:rPr></w:pPr>${line === 1 ? '' : `<w:r><w:rPr>${format}</w:rPr><w:t>Baseline ${size} pt, spacing ${spacing}/240, line ${line + 1}</w:t></w:r>`}</w:p>`);
      }
    }
  }
}
await Bun.write(output, buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:left="1440" w:bottom="1440" w:right="1440"/></w:sectPr></w:body></w:document>` }));
console.log(output);
