import type { Doc } from './types';

export const powerpointSupportDoc: Doc = {
  title: 'PowerPoint compatibility',
  description: 'Check supported slide content, editable objects, and playback limits.',
  sections: [
    { id: 'powerpoint', title: 'Rendering and playback', blocks: [
        { kind: 'table', headers: ['Content', 'Support and limits'], rows: [
          ['Text and fonts', 'Rich text, bullets, hyperlinks, tab stops, autofit, and embedded fonts. Browser text layout can differ from Office, especially with missing fonts.'],
          ['Shapes and pictures', 'Preset and custom shapes, grouped transforms, theme colours, gradients, cropping, tiling, common drawing effects, and supported raster, SVG, EMF, and WMF images. 3D effects are not supported.'],
          ['Tables', 'Built-in Office styles, merged cells, cell text and formatting edits, and table resizing. Inserting or deleting rows and columns is not supported.'],
          ['Charts', 'Supported OOXML chart types include stacked, percentage-stacked, and combination charts. Chart-data editing is not provided by the slide editor.'],
          ['Navigation and media', 'Slide links, speaker notes, and browser playback for embedded audio and video. Media playback depends on browser codec support.'],
          ['Animations', 'Preview controls for fade, appear, and wipe. Complex timing and full PowerPoint playback are not supported.'],
        ] },
    ] },
    { id: 'edits', title: 'Editing and export', blocks: [
        { kind: 'table', headers: ['Content', 'Support and limits'], rows: [
          ['Editing', 'Move, resize, rotate, and edit supported slide objects, including grouped objects and placeholders with inherited geometry. Native ink and its picture fallback move together.'],
          ['Read-only content', 'Shared master/layout objects, fields, signed presentations, SmartArt cached drawings, and unknown alternate representations. Saved SmartArt drawings can render, but diagram relayout is not implemented.'],
          ['Saving', 'Edits retain unrelated package parts, relationships, notes, and embedded files. Export without edits returns the original bytes. Edited ZIPs may omit directory records.'],
        ] },
        { kind: 'link', href: '/docs/powerpoint-editing', label: 'Connect a slide editing session' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint-support.ts',
};
