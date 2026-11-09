import type { Doc } from './types';

export const pdfMergeDoc: Doc = {
  title: 'Merge PDF pages',
  description: 'Combine documents and selected pages with one API, a CLI, or the Svelte merge tool.',
  sections: [
    { id: 'try', title: 'Arrange pages in your browser', blocks: [
      { kind: 'link', href: '/playground/pdf-merge', label: 'Open the PDF merge playground' },
      { kind: 'text', text: 'Add local PDFs and arrange source blocks in output order. Leave Pages empty to include every page, or enter one-based page numbers and inclusive ranges such as 5,2-4 or 3-1,1. Descending ranges and repeats are supported. Duplicate a block, choose another selection, and move it to insert pages from that PDF elsewhere. Passwords unlock the corresponding source. Choose the output filename and download a new PDF.' },
      { kind: 'text', text: 'All processing happens in browser memory. Input files stay unchanged. The CLI and browser use the same page-selection parser and merge API.' },
    ] },
    { id: 'cli', title: 'Use the CLI', blocks: [
      { kind: 'code', language: 'bash', code: 'tumbler first.pdf pdf merge --pages 3,1-2,1 \\\n  --source second.pdf --pages 2-1 \\\n  --source first.pdf --pages 4 --output merged.pdf' },
      { kind: 'text', text: 'The first file starts the first block. Each --source starts another block. --pages and --password apply to the most recent source. Omit --pages to include all its pages. Repeat a source to interleave its pages with another document. The output must be a new .pdf file; an existing destination is never overwritten.' },
    ] },
    { id: 'api', title: 'Use the shared API', blocks: [
      { kind: 'code', language: 'typescript', code: "import { mergePdfDocuments, openPdfDocument, parsePdfPageSelection } from '@tumblerjs/pdf';\n\nconst first = openPdfDocument(firstBytes);\nconst second = openPdfDocument(secondBytes, { password: 'source-password' });\nconst output = mergePdfDocuments([\n  { document: first, pages: parsePdfPageSelection('3,1-2,1', first.pages.length) },\n  { document: second, pages: [1, 0] },\n  { document: first, pages: [3] },\n]);" },
      { kind: 'text', text: 'API page indices are zero-based. The parser accepts the same one-based selections as the CLI and graphical tool. Omit pages to include the full document. Save the returned Uint8Array as a new PDF.' },
    ] },
    { id: 'svelte', title: 'Embed the graphical tool', blocks: [
      { kind: 'code', language: 'svelte', code: "<script>\n  import { PdfMerge } from '@tumblerjs/svelte/pdf';\n</script>\n\n<PdfMerge />" },
      { kind: 'text', text: 'The default action downloads the completed PDF. Pass onmerge={(bytes, filename) => save(bytes, filename)} to handle the output yourself. The component includes file selection, source passwords, page selection, block ordering, duplication, removal, and output naming.' },
    ] },
    { id: 'preservation', title: 'Content preservation', blocks: [
      { kind: 'text', text: 'Merging copies PDF page objects and their resources rather than rasterizing or reconstructing the visible text. Page dimensions, rotation, content streams, embedded fonts and images stay in PDF form. The output is a fresh, unencrypted document. Encryption passwords authenticate the sources; they do not encrypt the result. Digital signatures cannot authenticate a newly merged document.' },
      { kind: 'note', text: 'Unsupported structures or combinations produce an error before output is written. Check the package README for the supported structure details and limits. Keep your source documents when document-level features or signatures matter.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/pdf-merge.ts',
};
