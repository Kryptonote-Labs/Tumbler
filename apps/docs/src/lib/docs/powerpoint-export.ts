import type { Doc } from './types';

export const powerpointExportDoc: Doc = {
  title: 'Export a presentation',
  description: 'Save the edited presentation as PPTX, or export its slides as PDF pages.',
  sections: [
    { id: 'export', title: 'Download a PPTX', blocks: [
      { kind: 'text', text: '`session.artifact.bytes()` builds the PPTX file with all edits. Call it when the user saves or downloads, not after every edit, because it builds the whole archive each time.' },
      { kind: 'text', text: 'Add this function to the editor from [Edit slides](/docs/powerpoint-editing) and call it from a Download button:' },
      { kind: 'code', code: `function download() {
  const bytes = session.artifact.bytes();
  const blob = new Blob([Uint8Array.from(bytes).buffer], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'presentation.pptx';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}` },
      { kind: 'code', language: 'Svelte', code: `<button onclick={download}>Download</button>` },
      { kind: 'text', text: 'To store the file on a server instead, upload the `Uint8Array` from `bytes()`.' },
      { kind: 'note', text: 'Edits live only in memory until you save the bytes somewhere.' },
    ] },
    { id: 'pdf', title: 'Export PDF pages', blocks: [
      { kind: 'text', text: '`exportPresentationPdf(document, backend, options)` draws each slide onto a PDF page, using the same drawing code as the slide view. Your code supplies:' },
      { kind: 'list', items: [
        'a PDF canvas backend that writes vector output;',
        'fonts;',
        'image decoding;',
        'a way to turn SVG path strings into paths.',
      ] },
      { kind: 'text', text: 'Every slide is exported in order, including hidden ones. Page size is the slide size, converted from CSS pixels to points at 96 dpi. With a vector backend, text stays selectable.' },
      { kind: 'note', text: 'Unsupported effects, substituted fonts, SmartArt and animations can look different from PowerPoint. This function exports presentations only, not Word documents or spreadsheets.' },
      { kind: 'link', href: '/docs/powerpoint-support', label: 'PowerPoint compatibility' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint-export.ts',
  next: { href: '/docs/powerpoint-support', label: 'PowerPoint compatibility' },
};
