import type { Doc } from './types';

export const powerpointDoc: Doc = {
  title: 'PowerPoint',
  description: 'Show PPTX slides, let users edit them, and save the result.',
  sections: [
    { id: 'start', title: 'Where to start', blocks: [
      { kind: 'text', text: '`openPresentationArtifact` opens PPTX bytes. `PresentationSlideView` shows one slide, and `PresentationSlideRail` adds a column of thumbnails. For editing, open the file as a session instead, so every change can be undone.' },
      { kind: 'table', headers: ['To', 'Read'], rows: [
        ['Show a slide', '[Render a presentation](/docs/powerpoint-viewer)'],
        ['Add thumbnails and follow links between slides', '[Slide navigation](/docs/powerpoint-navigation)'],
        ['Let users edit text, tables and objects', '[Edit slides](/docs/powerpoint-editing)'],
        ['Save as PPTX, or export slides as PDF pages', '[Export a presentation](/docs/powerpoint-export)'],
        ['Check what is supported', '[PowerPoint compatibility](/docs/powerpoint-support)'],
      ] },
    ] },
    { id: 'try', title: 'Try it', blocks: [
      { kind: 'text', text: 'The playground opens a sample deck with thumbnails and editing turned on.' },
      { kind: 'link', href: '/playground/slides-brief', label: 'Open the presentation playground' },
      { kind: 'link', href: '/docs/releases', label: 'What changed in this release' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/slides/README.md', label: 'Full @tumblerjs/slides API' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint.ts',
  next: { href: '/docs/powerpoint-viewer', label: 'Render a presentation' },
};
