import type { Doc } from './types';

export const pdfMergeDoc: Doc = {
  title: 'Merge PDF pages',
  description: 'Combine whole PDFs or chosen pages, in the browser, from the command line or in code.',
  sections: [
    { id: 'selection', title: 'Choosing pages', blocks: [
      { kind: 'text', text: 'All three tools use the same page syntax. Page numbers start at 1.' },
      { kind: 'table', headers: ['You type', 'You get'], rows: [
        ['(empty)', 'Every page.'],
        ['`5,2-4`', 'Page 5, then pages 2, 3 and 4.'],
        ['`3-1`', 'Pages 3, 2 and 1, in that order.'],
        ['`1,1`', 'Page 1 twice.'],
      ] },
    ] },
    { id: 'try', title: 'In the browser', blocks: [
      { kind: 'list', ordered: true, items: [
        'Add your PDFs. Each one becomes a block.',
        'Arrange the blocks in the order you want.',
        'For each block, type the pages to include. To use pages from one file in two places, duplicate its block.',
        'Enter a password for any encrypted file.',
        'Name the result and download it.',
      ] },
      { kind: 'text', text: 'Everything happens in your browser. Files are not uploaded, and the originals are not changed.' },
      { kind: 'link', href: '/playground/pdf-merge', label: 'Open the PDF merge playground' },
    ] },
    { id: 'cli', title: 'From the command line', blocks: [
      { kind: 'code', language: 'bash', code: 'tumbler first.pdf pdf merge --pages 3,1-2,1 \\\n  --source second.pdf --pages 2-1 \\\n  --source first.pdf --pages 4 --output merged.pdf' },
      { kind: 'list', items: [
        'The first file starts the first block. Each `--source` starts another.',
        '`--pages` and `--password` apply to the source just before them. Leave out `--pages` to include every page.',
        'Name a file twice, as `first.pdf` is above, to interleave its pages with another file.',
        '`--output` must be a new `.pdf` file. An existing file is never overwritten.',
      ] },
    ] },
    { id: 'api', title: 'In code', blocks: [
      { kind: 'code', language: 'typescript', code: "import { mergePdfDocuments, openPdfDocument, parsePdfPageSelection } from '@tumblerjs/pdf';\n\nconst first = openPdfDocument(firstBytes);\nconst second = openPdfDocument(secondBytes, { password: 'source-password' });\nconst output = mergePdfDocuments([\n  { document: first, pages: parsePdfPageSelection('3,1-2,1', first.pages.length) },\n  { document: second, pages: [1, 0] },\n  { document: first, pages: [3] },\n]);" },
      { kind: 'note', text: 'In code, page indexes start at 0. `parsePdfPageSelection` converts the 1-based syntax above into indexes.' },
      { kind: 'text', text: 'Leave out `pages` to include the whole document. `mergePdfDocuments` returns the new PDF as a `Uint8Array`.' },
    ] },
    { id: 'svelte', title: 'In your app', blocks: [
      { kind: 'text', text: '`PdfMerge` is the same tool as the playground: choosing files, passwords, pages, block order, duplicating and removing blocks, and naming the output.' },
      { kind: 'code', language: 'svelte', code: "<script>\n  import { PdfMerge } from '@tumblerjs/svelte/pdf';\n</script>\n\n<PdfMerge />" },
      { kind: 'text', text: 'By default it downloads the merged PDF. To save it yourself, pass `onmerge`, which receives the bytes and the file name.' },
    ] },
    { id: 'preservation', title: 'What is kept', blocks: [
      { kind: 'text', text: 'Pages are copied as PDF, not turned into images. Page size, rotation, fonts and images stay as they were, and text stays selectable.' },
      { kind: 'list', items: [
        'The merged file is never encrypted. Passwords only unlock the source files.',
        'A source with signature fields, scripted forms or form actions is rejected.',
        'If a source uses something the merge does not support, it fails before writing anything.',
      ] },
      { kind: 'note', text: 'Keep the original files if their document-level features matter.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/pdf-merge.ts',
};
