import type { Doc } from './types';

export const wordDrawingsDoc: Doc = {
  title: 'Images and shapes',
  description: 'Add images and shapes, and let users move, resize and edit them.',
  sections: [
    { id: 'images', title: 'Add an image', blocks: [
      { kind: 'text', text: 'An image is a run whose text is one U+FFFC object character, with an `image` property. It takes PNG or JPEG bytes and a size in points.' },
      { kind: 'code', code: `import { createWordArtifact } from '@tumblerjs/word';

const imageBytes = new Uint8Array(await file.arrayBuffer()); // PNG
const artifact = createWordArtifact({ blocks: [{
  kind: 'paragraph', runs: [
    { text: 'Diagram: ' },
    { text: '\\uFFFC', image: {
      bytes: imageBytes, contentType: 'image/png',
      width: 160, height: 100, alt: 'System overview',
    } },
  ],
}] });` },
      { kind: 'text', text: '`layout` decides how the image sits in the text:' },
      { kind: 'list', items: [
        '`\'inline\'` places it in the line, like a large character.',
        '`\'front\'` floats it above the text.',
        '`\'behind\'` floats it underneath the text.',
      ] },
      { kind: 'text', text: 'Place a floating image with these options:' },
      { kind: 'table', headers: ['Option', 'Value'], rows: [
        ['`alignment`', '`\'left\'`, `\'center\'` or `\'right\'` within the column. Defaults to `\'left\'`.'],
        ['`x`', 'Horizontal offset in points. Overrides `alignment`.'],
        ['`y`', 'Vertical offset in points. Defaults to 0.'],
        ['`moveWithText`', 'When `true` (the default), `y` is measured from the paragraph. When `false`, from the page.'],
      ] },
      { kind: 'note', text: 'Floating images do not push text aside, and tight and through wrapping are not supported yet.' },
      { kind: 'text', text: 'When you change an image\'s size or position, pass the same `Uint8Array` again so the file keeps a single copy of the picture.' },
    ] },
    { id: 'shapes', title: 'Add a shape', blocks: [
      { kind: 'text', text: 'A shape is also a run with one U+FFFC character, this time with a `shape` property. Shapes export as editable DrawingML, so they stay editable in Word.' },
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
      { kind: 'table', headers: ['Property', 'Sets'], rows: [
        ['`preset`', 'The outline: `rect`, `roundRect`, `ellipse`, `triangle`, `diamond`, `rightArrow`, `chevron`, `star5` or `line`.'],
        ['`width`, `height`', 'Size in points.'],
        ['`fill`, `gradient`', 'A solid colour, or a linear, radial or rectangular gradient.'],
        ['`outline`, `outlineWidth`', 'Border colour and width in points.'],
        ['`cornerRadius`', 'Corner rounding for `roundRect`, in points.'],
        ['`text`', 'Text inside the shape. It stays editable.'],
        ['`textInsets`', 'Margins around the text, in points. Omitted sides use 3.6 top and bottom and 7.2 left and right; `0` is allowed.'],
        ['`zOrder`', 'Stacking order among floating drawings.'],
      ] },
      { kind: 'text', text: 'Shapes are placed with the same `layout` and position properties as images. Without a `layout`, a new shape floats in front of the text at a fixed position on the page. Set `layout: \'inline\'` for the behaviour before alpha.27.' },
    ] },
    { id: 'shape-text', title: 'Edit text in a shape', blocks: [
      { kind: 'text', text: '`WordDrawingView` lets the user edit a shape\'s text in place when it is `editable` and has an `ontextchange` callback. Double-click the shape, or select it and start typing. Escape or clicking away commits the text.' },
      { kind: 'text', text: '`ontextchange` receives the new text. Apply it to your native content model yourself.' },
      { kind: 'note', text: '`WordDocumentView` draws shapes but does not edit their text. Use `WordDrawingView` for that.' },
      { kind: 'text', text: 'If your page has its own placement controls, set `layoutControl` to `false` to hide the built-in one.' },
    ] },
    { id: 'controls', title: 'Move and resize', blocks: [
      { kind: 'text', text: 'Make `WordDocumentView` `editable` and pass `ondrawingchange`. Apply each change with `session.updateDrawing(change)` so it can be undone and is included in the export.' },
      { kind: 'list', items: [
        'Drag a drawing to move it. Dragging an inline drawing moves it within the text.',
        'Corner handles keep the proportions. Edge handles change one dimension.',
        'The layout control switches between inline, in front of text and behind text.',
        'Arrow keys nudge a selected floating drawing by 1 point, or 10 with Shift.',
        'Escape cancels a drag.',
      ] },
    ] },
    { id: 'imported-pictures', title: 'Pictures from existing files', blocks: [
      { kind: 'text', text: 'Pictures in imported documents keep their cropping, rotation and flips, both on screen and on canvas. Moving, resizing, undo and export keep the original crop and transform markup.' },
      { kind: 'list', items: [
        'A negative crop leaves transparent padding around the picture.',
        'Resize handles follow the drawing\'s unrotated frame.',
        'Floating drawings stack by their saved order within the front or behind layer.',
      ] },
      { kind: 'note', text: 'Some pictures are kept exactly as saved but not drawn: grouped pictures, tiled fills, non-rectangular masks, fills that do not rotate with their shape, and pictures whose size differs from their frame. Picture effects are not supported.' },
      { kind: 'text', text: 'Imported shapes that are grouped, transformed, filled with theme effects or wrapped by text are also kept as saved. Editing the text around them does not change their markup.' },
    ] },
    { id: 'ink', title: 'Ink', blocks: [
      { kind: 'text', text: '`@tumblerjs/ink` reads Office ink drawings, keeps their original strokes and brush settings, and draws them as vector previews. In Word you can also draw and edit strokes; the saved picture fallback is kept. Strokes in one drawing share coordinates, so they stay in place relative to each other.' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/ink/README.md', label: 'Ink decoding, preservation and limits' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-drawings.ts',
  next: { href: '/docs/word-layout', label: 'Page layout and positions' },
};
