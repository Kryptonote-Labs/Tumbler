import type { Doc } from './types';

export const powerpointSupportDoc: Doc = {
  title: 'PowerPoint compatibility',
  description: 'What Tumbler can show, play and edit in a presentation, and what is still missing.',
  sections: [
    { id: 'powerpoint', title: 'Slide content', blocks: [
      { kind: 'table', headers: ['Content', 'Supported', 'Missing'], rows: [
        ['Text', 'Rich text, bullets, links, tab stops, autofit and embedded fonts.', 'Text can lay out differently from PowerPoint, especially when a font is missing.'],
        ['Shapes and pictures', 'Preset and custom shapes, groups, theme colours, gradients, cropping, tiling, common effects, and PNG, JPEG, SVG, EMF and WMF images.', '3D effects.'],
        ['Tables', 'Built-in table styles and merged cells.', '—'],
        ['Charts', 'The supported chart types, including stacked, 100% stacked and combination charts.', 'Some chart types; see [Charts](/docs/charts).'],
        ['Links, notes and media', 'Links between slides, speaker notes, and embedded audio and video.', 'Media formats the browser cannot play.'],
        ['Animations', 'Preview of fade, appear and wipe.', 'Complex timing and full slideshow playback.'],
      ] },
    ] },
    { id: 'edits', title: 'Editing', blocks: [
      { kind: 'text', text: 'You can move, resize, rotate and edit the text of slide objects, including grouped objects and placeholders that inherit their position from the layout. Table cells can be edited and formatted, and tables resized. Ink moves together with its saved picture fallback.' },
      { kind: 'text', text: 'These are shown but cannot be edited:' },
      { kind: 'list', items: [
        'objects that come from the slide master or layout;',
        'fields, such as slide numbers;',
        'digitally signed presentations;',
        'SmartArt. Its saved drawing is shown, but it is not laid out again when edited.',
      ] },
    ] },
    { id: 'saving', title: 'Saving', blocks: [
      { kind: 'list', items: [
        'Saving keeps everything you did not edit, including notes and embedded files.',
        'Saving without edits returns the original bytes unchanged.',
        'An edited file\'s ZIP archive may leave out folder entries.',
      ] },
      { kind: 'link', href: '/docs/powerpoint-editing', label: 'Edit slides' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint-support.ts',
};
