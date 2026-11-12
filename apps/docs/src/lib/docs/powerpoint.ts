import type { Doc } from './types';

export const powerpointDoc: Doc = {
  title: 'PowerPoint',
  description: 'Read PPTX slide scenes, build a viewer, and connect supported editing operations.',
  sections: [
    { id: 'alpha-27', title: 'New in alpha.27', blocks: [
      { kind: 'link', href: '/docs/releases', label: 'Authoring additions and migration notes' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/slides/README.md', label: 'Native commands and package API' },
      { kind: 'link', href: '/docs/charts', label: 'Shared chart authoring and rendering' },
      { kind: 'link', href: '/docs/cli', label: 'Command-line operations' },
    ] },
    { id: 'view', title: 'Build a presentation viewer', blocks: [
      { kind: 'text', text: 'Open PPTX bytes with openPresentationArtifact and render a slide with PresentationSlideView. Add thumbnails and internal slide navigation with PresentationSlideRail.' },
      { kind: 'link', href: '/docs/powerpoint-viewer', label: 'Open and render a presentation' },
      { kind: 'link', href: '/docs/powerpoint-navigation', label: 'Connect slide navigation' },
    ] },
    { id: 'edit', title: 'Edit and export', blocks: [
      { kind: 'text', text: 'Use an editing session for text and table-cell edits, formatting, object transforms, and undo. Generate the PPTX archive when saving or downloading.' },
      { kind: 'link', href: '/docs/powerpoint-editing', label: 'Connect slide editing' },
      { kind: 'link', href: '/docs/powerpoint-export', label: 'Export a presentation' },
    ] },
    { id: 'try', title: 'Try a presentation', blocks: [
      { kind: 'link', href: '/playground/slides-brief', label: 'Open the presentation playground' },
      { kind: 'link', href: '/docs/powerpoint-support', label: 'PowerPoint support and limitations' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint.ts',
  next: { href: '/docs/powerpoint-viewer', label: 'Render a presentation' },
};
