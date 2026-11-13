import type { Doc } from './types';

export const spreadsheetViewerDoc: Doc = {
  title: 'Open a spreadsheet',
  description: 'Render an XLSX worksheet, edit cells, and switch sheets without losing edits.',
  sections: [
    { id: 'install', title: 'Install', blocks: [
      { kind: 'code', language: 'Terminal', code: 'bun add @tumblerjs/core @tumblerjs/sheets @tumblerjs/svelte' },
      { kind: 'text', text: '`@tumblerjs/sheets` opens an XLSX file from `Uint8Array` bytes and gives you the methods for editing it. `@tumblerjs/svelte` displays the result, and `@tumblerjs/core` holds types both of them share, such as `GridSelection`. Because the input is plain bytes, the file can come from an upload, `fetch` or your own storage.' },
      { kind: 'text', text: 'Each example below is a component that takes the file as a `bytes` prop. To run the first one, save it as `GridPreview.svelte`, put your workbook in `static/`, and load it from `+page.svelte`:' },
      { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import { onMount } from 'svelte';
  import GridPreview from './GridPreview.svelte';

  let bytes = $state<Uint8Array>();
  onMount(async () => {
    const response = await fetch('/project-budget.xlsx');
    bytes = new Uint8Array(await response.arrayBuffer());
  });
</script>

{#if bytes}<GridPreview {bytes} />{/if}` },
    ] },
    { id: 'render', title: 'Render a worksheet', blocks: [
      { kind: 'text', text: '`openSpreadsheetArtifact(bytes)` opens the workbook as an artifact, with its first visible sheet selected.' },
      { kind: 'text', text: 'Editing methods return a new artifact and leave the original unchanged. Keep the current artifact in `$state` and assign each result back.' },
      { kind: 'text', text: 'Pass `artifact.worksheet` and `artifact.calculation` to `SpreadsheetGrid`. The grid fills its parent, so give the parent a height.' },
      { kind: 'example', example: 'spreadsheet-grid' },
      { kind: 'text', text: 'When the user commits a cell, `onedit` receives its reference and new value. `artifact.editCell(reference, value)` returns a new artifact whose `calculation` includes the edit. Assign it, and the grid redraws with the new totals.' },
      { kind: 'note', text: 'Typing in a grid cell always enters a value, even if it starts with `=`. To enter formulas, add a `SpreadsheetFormulaBar` or call `artifact.editFormula` directly.' },
    ] },
    { id: 'sheets', title: 'Switch worksheets', blocks: [
      { kind: 'text', text: '`artifact.workbook.sheets` lists every sheet. `artifact.selectSheet` takes a sheet\'s name or its `sheetId` (not its position in the list) and returns an artifact showing that sheet. The workbook is the same one, so edits made on other sheets are kept.' },
      { kind: 'example', example: 'workbook-sheets' },
    ] },
    { id: 'zoom', title: 'Zoom', blocks: [
      { kind: 'text', text: 'Users can zoom from 25% to 300% with a trackpad pinch, `Ctrl` + mouse wheel, or a two-finger pinch on a touchscreen. To add your own zoom controls, bind `scale`, where `1` is 100%. Headers, frozen panes and the cell editor all scale together.' },
      { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  let scale = $state(1);
</script>

<SpreadsheetGrid worksheet={artifact.worksheet} calculation={artifact.calculation} bind:scale />` },
    ] },
    { id: 'save', title: 'Save', blocks: [
      { kind: 'text', text: '`artifact.bytes()` returns the workbook as XLSX bytes, with your edits included. Tumbler preserves content it cannot edit, but a few features do not survive a save exactly; Spreadsheet compatibility lists them. To offer a download or upload the file, wrap the bytes in a `Blob`:' },
      { kind: 'code', code: `const file = new Blob([Uint8Array.from(artifact.bytes()).buffer], {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});` },
      { kind: 'link', href: '/docs/spreadsheet-support', label: 'Spreadsheet compatibility' },
    ] },
    { id: 'headless', title: 'Render without a browser', blocks: [
      { kind: 'text', text: 'You can draw a worksheet to an image on a server or in a worker. `layoutSpreadsheetViewport` lays out a `width` × `height` area of the sheet, including cells, frozen panes, merged cells and drawings such as charts. The result is plain data, so you can pass it to a worker. `paintSpreadsheetViewport` then draws it on any Canvas 2D context.' },
      { kind: 'text', text: 'Your code supplies:' },
      { kind: 'list', items: [
        'the canvas;',
        'a way to turn path strings into paths, for example `new Path2D(d)`;',
        'the fonts;',
        'decoded pictures: decode each source listed by `spreadsheetViewportImages(layout)`, then pass an `image(source)` option that returns `{ image, width, height }`;',
        'encoding of the finished image.',
      ] },
      { kind: 'text', text: 'Pictures that `image` does not return are left blank.' },
      { kind: 'code', code: `import {
  openSpreadsheetArtifact,
  layoutSpreadsheetViewport,
  paintSpreadsheetViewport,
} from '@tumblerjs/sheets';

const artifact = openSpreadsheetArtifact(bytes);
const layout = layoutSpreadsheetViewport(artifact.worksheet, {
  width: 1024, height: 768, calculation: artifact.calculation,
});

paintSpreadsheetViewport(context, layout, {
  path: (d) => new Path2D(d),
});` },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/spreadsheet-viewer.ts',
  next: { href: '/docs/spreadsheet-editing', label: 'Cells and formulas' },
};
