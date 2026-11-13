import type { Doc } from './types';

export const pdfDoc: Doc = {
  title: 'PDF documents',
  description: 'Show PDF pages, select and copy text, edit together, and combine pages.',
  sections: [
    { id: 'open', title: 'Open a PDF', blocks: [
      { kind: 'text', text: '`openPdfDocument` reads PDF bytes. `PdfInterpreter` turns a page into a scene you can draw, and `pdfTextContent` pulls the text out of that scene.' },
      { kind: 'code', language: 'typescript', code: `import { openPdfDocument, PdfInterpreter, pdfTextContent } from '@tumblerjs/pdf';

const document = openPdfDocument(bytes);
const scene = new PdfInterpreter(document).page(0);
const text = pdfTextContent(scene);
const unchanged = document.bytes();` },
      { kind: 'list', items: [
        'For an encrypted file, pass `{ password }` as the second argument.',
        '`bytes()` on an unchanged document returns the original file exactly.',
        'Text is drawn from the PDF\'s own glyph shapes, not laid out again by the browser, so it looks as the author saved it.',
      ] },
    ] },
    { id: 'view', title: 'Show it in Svelte', blocks: [
      { kind: 'code', language: 'svelte', code: `<script lang="ts">
  import { PdfDocumentView } from '@tumblerjs/svelte/pdf';
  import { openPdfDocument } from '@tumblerjs/pdf';
  let { bytes }: { bytes: Uint8Array } = $props();
  const document = $derived(openPdfDocument(bytes));
</script>

<PdfDocumentView {document} />` },
      { kind: 'text', text: '`PdfDocumentView` lets users select and copy text, rotate pages and zoom.' },
      { kind: 'note', text: 'Scanned pages are images, so they have no text to select until you run OCR on them. Text is ordered by its position on the page, which can be wrong for tagged PDFs and right-to-left text.' },
    ] },
    { id: 'edit', title: 'Edit together', blocks: [
      { kind: 'text', text: 'Collaborative PDF editing keeps the page text in Yjs, so several people can edit it at once.' },
      { kind: 'table', headers: ['API', 'Does'], rows: [
        ['`PdfTextModel`', 'Stores the text recovered from the PDF and where it sits on each page.'],
        ['`iteratePdfText`', 'Reads that text one page at a time, to keep memory low while setting up.'],
        ['`PdfEditableDocument`', 'The Svelte editor: typing, formatting, moving and resizing text, annotations, images, undo and showing who else is editing.'],
        ['`exportEditedPdf`', 'Saves the edits as a new revision appended to the original file.'],
      ] },
      { kind: 'note', text: 'Import the text once, on one machine, save that state, and send it to everyone else. If each person imports the PDF separately, their copies will not match.' },
      { kind: 'text', text: 'Your app provides the fonts (`PdfEditingFonts`), saving, sign-in and the connection between users.' },
      { kind: 'list', items: [
        'An encrypted PDF can be unlocked to view it and copied into an editable document, but edits cannot be saved back into an encrypted file yet.',
        'Deleting or covering text is not secure redaction. The original content can still be in the file.',
      ] },
    ] },
    { id: 'pages', title: 'Combine and remove pages', blocks: [
      { kind: 'text', text: 'You can extract, delete and merge pages with the API or the command-line tool. Collaborative documents can also insert, duplicate and delete pages. Pages are copied as PDF, not turned into images, so text stays selectable and sharp.' },
      { kind: 'link', href: '/docs/pdf-merge', label: 'Merge PDF pages' },
      { kind: 'link', href: '/docs/cli', label: 'Command-line editing' },
    ] },
    { id: 'limits', title: 'Limits', blocks: [
      { kind: 'text', text: 'This is a first implementation of the PDF 1.7 standard (ISO 32000-1). When a page uses something Tumbler cannot draw, it throws a `PdfError` instead of quietly leaving marks out.' },
      { kind: 'text', text: 'Not supported yet:' },
      { kind: 'list', items: [
        'Type 1 font programs and the predefined CJK character maps;',
        'tiling patterns, mesh shadings, transparency groups and soft masks;',
        'clipping to text;',
        'JPEG 2000, JBIG2 and CCITT images.',
      ] },
      { kind: 'text', text: 'ICC colour profiles fall back to their alternate colour space.' },
      { kind: 'note', text: 'Parse and draw untrusted files in a worker you can cancel, so a hostile file cannot freeze the page.' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/pdf/README.md', label: 'Full @tumblerjs/pdf API and compatibility results' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/pdf.ts',
};
