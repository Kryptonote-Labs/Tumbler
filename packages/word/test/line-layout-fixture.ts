import { openOpcPackage } from '@tumblerjs/opc';
import { openWordDocument } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

export function lineDocument(text: string, properties = '', width = 100, raw = false) {
  return openWordDocument(openOpcPackage(buildWordDocumentFixture({ documentXml:
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
    <w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="200" w:lineRule="exact"/>${properties}</w:pPr><w:r>${raw ? text : `<w:t xml:space="preserve">${text}</w:t>`}</w:r></w:p>
    <w:sectPr><w:pgSz w:w="${width * 20 + 400}" w:h="1000"/><w:pgMar w:top="200" w:bottom="200" w:left="200" w:right="200"/></w:sectPr>
    </w:body></w:document>` })));
}

export const fixedMeasurer = { measure(text: string) { return { width: text.length * 5, ascent: 8, descent: 2 }; } };

