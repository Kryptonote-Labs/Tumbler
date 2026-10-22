import type { Doc } from './types';

export const wordDrawingsDoc: Doc = {
  title: 'Images and shapes',
  description: 'Author drawings and connect movement, resizing, and shape text edits.',
  sections: [
    { id: 'images', title: 'Inline and floating images', blocks: [
        { kind: 'code', code: `import { createWordArtifact } from '@tumblerjs/word';

const imageBytes = new Uint8Array(await file.arrayBuffer()); // PNG
const artifact = createWordArtifact({ blocks: [{
  kind: 'paragraph', runs: [
    { text: 'Diagram: ' },
    { text: '￼', image: {
      bytes: imageBytes, contentType: 'image/png',
      width: 160, height: 100, alt: 'System overview',
    } },
  ],
}] });` },
        { kind: 'text', text: 'Authored images accept PNG or JPEG bytes. An image run occupies one U+FFFC character. Set layout to inline, front, or behind; floating images accept alignment, x, y, and moveWithText.' },
        { kind: 'text', text: 'Dimensions and offsets use points. x overrides horizontal alignment. y is relative to the paragraph by default, or the page when moveWithText is false.' },
        { kind: 'text', text: 'Reuse the same immutable Uint8Array when changing image geometry so media identity stays stable. Front and behind placement do not reserve text space. Tight and through text wrapping remain incomplete.' },
    ] },
    { id: 'imported-pictures', title: 'Imported picture geometry', blocks: [
        { kind: 'text', text: 'DOM and canvas rendering apply DrawingML source cropping, clockwise rotation and horizontal or vertical reflection. Negative crop offsets leave transparent padding. Crop and transform markup and media bytes survive movement, resizing, export, undo and redo. Editing coordinates and handles remain in the unrotated drawing frame.' },
        { kind: 'text', text: 'Floating drawings use relativeHeight order within their front or behind layer, including values above the CSS signed-integer limit.' },
        { kind: 'note', text: 'Grouped pictures, tiled fills, non-default fill rectangles, nonrectangular masks, fills that do not rotate with their shape, and local picture extents that differ from the drawing frame are classified as unsupported and retain their original XML. This does not add support for picture effects or complete tight/through wrapping.' },
    ] },
    { id: 'shapes', title: 'Editable shapes', blocks: [
        { kind: 'code', code: `import { NativeWordDocument } from '@tumblerjs/word';

const model = new NativeWordDocument();
model.update([{
  kind: 'paragraph', runs: [{ text: '\\uFFFC', shape: {
    preset: 'roundRect', width: 160, height: 72,
    fill: '#DDF5EB', outline: '#24634B', outlineWidth: 1,
    text: 'Review complete', layout: 'inline',
    textInsets: { top: 0, right: 2, bottom: 0, left: 2 },
  } }],
}]);
const output = model.artifact().bytes();` },
        { kind: 'text', text: 'The seven presets are rect, roundRect, ellipse, triangle, diamond, rightArrow, and line. Shapes use one U+FFFC object character, point dimensions, solid RGB or none fills/outlines, and plain text. Placement is inline, front, or behind, using the same positioning properties as images.' },
        { kind: 'text', text: 'Exports contain editable DrawingML shapes.' },
        { kind: 'text', text: 'textInsets sets internal text margins in points on each side. Omitted sides use 3.6pt top/bottom and 7.2pt left/right. Explicit zero is supported. The editor, canvas rendering, and DOCX import/export use the same margins.' },
        { kind: 'text', text: 'WordDrawingView reports in-place text edits through ontextchange when editable and a callback is connected. Double-click a shape or type while it is selected; Escape or blur commits the text. The host updates its native content model.' },
        { kind: 'text', text: 'Set layoutControl to false when the host supplies placement controls. WordDocumentView renders shapes, but does not connect this text callback itself.' },
        { kind: 'note', text: 'Imported groups, transformed shapes, theme/effect fills, and text-wrapped shapes remain opaque source drawings. Neighbouring edits retain their markup. Full preset geometry, rich text boxes, and shape effects are not supported by this editable model.' },
    ] },
    { id: 'controls', title: 'Move and resize drawings', blocks: [
        { kind: 'text', text: 'Pass ondrawingchange to WordDocumentView in Edit mode. Apply changes with session.updateDrawing(change) for undo, redo, and DOCX export.' },
        { kind: 'list', items: [
          'Drag to move. Corner handles preserve proportions; edge handles adjust one dimension.',
          'Choose inline, in front of text, or behind text with the layout control.',
          'Dragging an inline drawing moves it within the text flow.',
          'Arrow keys nudge a focused floating drawing; Shift makes larger steps. Escape cancels a drag.',
        ] },
        { kind: 'text', text: 'These controls do not provide square or tight text wrapping.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-drawings.ts',
  next: { href: '/docs/word-layout', label: 'Page layout and positions' },
};
