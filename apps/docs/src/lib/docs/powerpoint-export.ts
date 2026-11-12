import type { Doc } from './types';

export const powerpointExportDoc: Doc = {
  title: 'Export a presentation',
  description: 'Build PPTX bytes when saving or downloading the edited presentation.',
  sections: [
    { id: 'pdf', title: 'Export real PDF pages', blocks: [
      { kind: 'text', text: 'exportPresentationPdf(document, backend, options) paints through the shared slide canvas engine. Supply a vector PDF canvas backend, fonts, image decoding and SVG path construction. Pages use slide dimensions converted from CSS pixels to points at 96 dpi.' },
      { kind: 'text', text: 'The API exports every slide in document order, including hidden slides. A vector backend can retain selectable text, paths and images. Unsupported effects, font substitution, SmartArt and animation can differ from PowerPoint. This API does not export Word or spreadsheets.' },
    ] },

    { id: 'export', title: 'Download the edited file', blocks: [
        { kind: 'text', text: 'Add this function to the editor script and call it from your Download button. Call bytes() when saving, not after every edit: it builds the PPTX archive on demand.' },
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
        { kind: 'text', text: 'For server storage, send the returned Uint8Array through your upload flow instead. Edits remain in memory until you save them.' },
        { kind: 'link', href: '/docs/powerpoint-support#powerpoint', label: 'PowerPoint format support and limitations' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint-export.ts',
  next: { href: '/docs/powerpoint-support', label: 'PowerPoint compatibility' },
};
