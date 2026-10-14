import type { Doc } from './types';

export const wordSupportDoc: Doc = {
  title: 'Word compatibility',
  description: 'Check supported content, playground controls, and the remaining layout gaps.',
  sections: [
    { id: 'word', title: 'Content and authoring', blocks: [
        { kind: 'table', headers: ['Content', 'Support and limits'], rows: [
          ['Native editing', 'Create or import rich content, retain source properties, and export DOCX. Optional anchored Yjs operations cover text, formatting, images, tables, and literal find/replace. Host controls must connect these APIs.'],
          ['Text and paragraphs', 'Character emphasis, highlight, superscript/subscript, spacing, paragraph pagination rules, shading, and basic borders. Built-in Normal, Title, Subtitle, and Heading 1–9 styles; imported definitions take precedence.'],
          ['Lists, links, and breaks', 'Nine list levels, letter/Roman numbering, custom bullets, compound labels, and explicit starts. Hyperlink authoring and explicit line/page/column breaks.'],
          ['Tables', 'Nested tables, spans, vertical merges, direct cell formatting, row continuation, and repeated header rows. Conditional table styles are incomplete.'],
        ] },
    ] },
    { id: 'pages', title: 'Pages and drawings', blocks: [
        { kind: 'table', headers: ['Content', 'Support and limits'], rows: [
          ['Headers and footers', 'Edit shared stories and section variants. Live PAGE/NUMPAGES fields work in header/footer layout. Section numbering restarts and numeral formats are not evaluated.'],
          ['Fields', 'Supported simple and complex page fields are editable. General field recalculation, including contents pages and cross-references, is not implemented. Other cached results have partial rendering support.'],
          ['Images and placement', 'Inline, front, and behind authoring; image and chart movement/resizing. Polygon wrapping remains incomplete.'],
          ['Editable shapes', 'Seven presets with solid fills, outlines, placement, and plain text. WordDrawingView offers in-place text editing through a host callback. Imported groups, transformed shapes, and unsupported fills/wrapping remain opaque. Rich text boxes and shape effects are incomplete.'],
          ['Notes and pagination', 'Footnotes/endnotes render, but note numbering and body repagination remain incomplete. Fonts, paragraph keep rules, and complex layouts can differ from Word.'],
        ] },
    ] },
    { id: 'review', title: 'Review and playground controls', blocks: [
        { kind: 'text', text: 'Basic inserted/deleted text wrappers are recognized. Comments, full revision review, content controls, and native equations are not supported for editing or full rendering. Retained XML does not guarantee visible content.' },
        { kind: 'text', text: 'The Word playground connects package-backed text editing, basic formatting, and image/chart movement and resizing.' },
        { kind: 'list', items: [
          'Native and collaborative APIs need host controls.',
          'Rich clipboard paste, find/replace controls, and heading navigation remain gaps in the everyday browser benchmark.',
        ] },
        { kind: 'link', href: '/docs/word-collaboration', label: 'Collaborative operations and validation' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-support.ts',
};
