export type Block =
  | { kind: 'text' | 'note'; text: string }
  | { kind: 'code'; code: string; language?: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] };
export interface Doc {
  title: string;
  description: string;
  sections: { id: string; title: string; blocks: Block[] }[];
  next?: { href: string; label: string };
}

export const docs: Record<string, Doc> = {
  powerpoint: {
    title: 'PowerPoint',
    description: 'Open PPTX presentations, view slides, and make small, targeted edits. Available in the local workspace preview; not yet published.',
    sections: [
      { id: 'coverage', title: 'What works', blocks: [
        { kind: 'text', text: 'The reader follows presentation relationships in slide order and resolves slide, layout, master, and theme sources. The viewer draws 186 preset shapes and custom paths, formatted text, embedded raster pictures, tables, and supported OOXML charts. It resolves built-in table styles, theme colours, gradients, ordinary outer shadows, dashed lines, and arrow ends. Group transforms are rendered, with group contents kept read-only. Layout and slide theme overrides are resolved. Picture fills support cropping and tiling; SVG, BMP, and supported EMF/WMF images render alongside raster images. Common hatch patterns, glow, inner shadows, blur, soft edges, and reflections are rendered. Stacked and combination charts are supported.' },
        { kind: 'text', text: 'Text supports saved autofit, custom tab stops, distributed alignment, script-specific and embedded fonts, common numbered bullets, character spacing, capitals, baseline offsets, strike-through, and hyperlinks. Slide links navigate within the deck; speaker notes appear below the active slide.' },
        { kind: 'text', text: 'In Edit mode, drag an eligible slide object to move it and use its edge or corner handles to resize it. Drag the handle above the selection to rotate; hold Shift to snap to 15-degree increments. Rotated objects remain editable. Arrow keys nudge a selection. Double-click a text box or press Enter to edit in place. Select words to format them with the shared text toolbar. Enter adds a paragraph; Ctrl+Enter or Escape finishes editing. Changes apply as you type and support undo/redo. Select a shape to change its fill, outline colour, or outline width. Double-click a table cell to edit it and use Tab or Shift+Tab to move between cells. Drag the table border to move it or its handles to resize it; text keeps its font size.' },
        { kind: 'note', text: 'This is a first implementation, not full PowerPoint fidelity. Table cells support text and formatting edits; inserting or deleting rows and columns is not supported yet. Saved SmartArt drawings can be displayed, but diagram relayout is not implemented. Embedded audio and video use browser playback. Fade, appear, and wipe effects have preview controls; more complex timing and 3D effects remain unsupported. Preset/custom geometry, gradients, theme colours, and built-in table styles are supported; exact Office text layout remains incomplete. Browser font availability affects text wrapping. The viewer reports unsupported content on each slide.' }
      ] },
      { id: 'viewer', title: 'Render a slide', blocks: [
        { kind: 'text', text: 'These imports currently require the Tumbler workspace. The presentation package remains private until release qualification. Give the viewer a constrained height. A scale of 1 fits the slide into its available space.' },
        { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import { untrack } from 'svelte';
  import { openPresentationArtifact } from '@tumblerjs/slides';
  import { PresentationSlideView } from '@tumblerjs/svelte/slides';
  let { bytes }: { bytes: Uint8Array } = $props();
  const artifact = untrack(() => openPresentationArtifact(bytes));
  let scale = $state(1);
</script>
<div style="height: 480px; min-width: 0">
  {#if artifact.document.slides[0]}
    <PresentationSlideView presentation={artifact.document}
      slide={artifact.document.slides[0]} bind:scale />
  {/if}
</div>` }
      ] },
      { id: 'navigation', title: 'Add slide previews', blocks: [
        { kind: 'text', text: 'PresentationSlideRail shows selectable thumbnails and supports arrow keys, Home, and End. Bind its index to the active slide. Nearby thumbnails render lazily and update when the presentation changes.' },
        { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import { PresentationSlideRail, PresentationSlideView } from '@tumblerjs/svelte/slides';
  import type { PresentationDocument } from '@tumblerjs/slides';
  let { presentation }: { presentation: PresentationDocument } = $props();
  let index = $state(0);
</script>
<div style="display: flex; height: 540px; min-width: 0">
  <aside style="width: 150px; flex-shrink: 0">
    <PresentationSlideRail {presentation} bind:index />
  </aside>
  <main style="flex: 1; min-width: 0">
    {#if presentation.slides[index]}
      <PresentationSlideView {presentation} slide={presentation.slides[index]!} />
    {/if}
  </main>
</div>` }
      ] },
      { id: 'edits', title: 'Apply and export edits', blocks: [
        { kind: 'code', code: `import { openPresentationEditingSession } from '@tumblerjs/slides';

const session = openPresentationEditingSession(bytes);
// Connect onobjectchange to session.updateObject(change).
// Connect ontextchange to session.replaceText(slideId, objectKey, value).
// Reassign your view's artifact after each operation.
const output = session.artifact.bytes();
// session.undo(); session.redo();` },
        { kind: 'text', text: 'Edits replace only the owning slide XML part. Unchanged part payloads, relationships, notes, chart data, and embedded files are retained. Opening and exporting without edits returns the original bytes. ZIP directory records may be removed when writing an edited package.' },
        { kind: 'text', text: 'Move, resize, rotate, and edit slide objects, including grouped objects and placeholders with inherited positions. Edits preserve hyperlinks, line breaks, autofit settings, animation timing, and Office metadata. Shared master/layout objects, fields, signed files, SmartArt cached drawings, and unknown alternate representations remain read-only.' }
      ] },
      { id: 'examples', title: 'Example decks', blocks: [
        { kind: 'list', items: ['Rendering checks: autofit, decimal tabs, picture fills, drawing effects, stacked and combination charts, embedded video, and animation playback.', 'Workspace presentation: three slides with text, shapes, and a chart.', 'Shapes and pictures: a 4:3 deck with rotation, transparency, rich text, and an embedded image.', 'Compatibility checks: grouped objects, a table, and notes.', 'Everyday PowerPoint features: preset shapes, a gradient, rich text, hyperlinks, speaker notes, and a theme-styled table.'] },
        { kind: 'text', text: 'Choose these decks in the playground, or download their PPTX files from there. They are original MIT-licensed fixtures generated by scripts/generate-presentation-fixtures.ts using PptxGenJS. They do not establish full compatibility with Microsoft PowerPoint.' }
      ] }
    ], next: { href: '/playground/slides-brief', label: 'Try PowerPoint' }
  },
  installation: {
    title: 'Installation',
    description: 'Add Tumbler to a Svelte 5 application. Parsing and editing run in the browser; your application owns loading and saving files.',
    sections: [
      { id: 'packages', title: 'Install the packages', blocks: [
        { kind: 'text', text: 'Install the Svelte components and the format packages you need. All public Tumbler packages share one version. Keep them on the same release.' },
        { kind: 'code', language: 'Terminal', code: 'bun add @tumblerjs/svelte @tumblerjs/word @tumblerjs/sheets @tumblerjs/core' },
        { kind: 'note', text: 'Tumbler is early alpha. The latest distribution tag points to the current alpha release. APIs and format coverage are still changing.' }
      ] },
      { id: 'first-document', title: 'Render a Word document', blocks: [
        { kind: 'text', text: 'Open a file as a Uint8Array, then pass the parsed document to WordDocumentView. Give the viewer a constrained height so its pages can scroll.' },
        { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import { openWordArtifact, type WordArtifact } from '@tumblerjs/word';
  import { WordDocumentView } from '@tumblerjs/svelte';

  let artifact = $state<WordArtifact>();
  let error = $state('');

  async function open(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      artifact = openWordArtifact(new Uint8Array(await file.arrayBuffer()));
      error = '';
    } catch {
      error = 'Could not open this document.';
    }
  }
</script>

<input type="file" accept=".docx" onchange={open} aria-label="Open Word document" />
{#if error}<p role="alert">{error}</p>{/if}
{#if artifact}
  <div style="height: 640px; min-width: 0">
    <WordDocumentView wordDocument={artifact.document} />
  </div>
{/if}` }
      ] },
      { id: 'headless', title: 'Use the model without Svelte', blocks: [
        { kind: 'text', text: 'The document models do not depend on a UI framework. Use the Word or Sheets package directly when building another renderer, inspecting documents, or applying edits.' },
        { kind: 'code', code: `import { openSpreadsheetArtifact } from '@tumblerjs/sheets';

const artifact = openSpreadsheetArtifact(bytes);
const edited = artifact.editCell('B2', 42);
const output = edited.bytes();` }
      ] }
    ], next: { href: '/docs/word', label: 'Word documents' }
  },
  architecture: {
    title: 'How it works',
    description: 'Tumbler separates Office package handling, document models, and the interface that renders them.',
    sections: [
      { id: 'flow', title: 'From file to view', blocks: [
        { kind: 'code', language: 'Data flow', code: 'DOCX / XLSX bytes\n  → OPC package and XML\n  → Word / Sheets artifact\n  → Svelte components\n  → edit operations\n  → updated artifact and file bytes' },
        { kind: 'text', text: 'An artifact is the application boundary. It contains the document model and exposes operations for editing, formatting, and exporting. Svelte components display that model and report user actions back to your application.' }
      ] },
      { id: 'packages', title: 'Package responsibilities', blocks: [
        { kind: 'table', headers: ['Package', 'Responsibility'], rows: [['@tumblerjs/opc', 'ZIP archives, package parts, relationships, and transactions.'], ['@tumblerjs/ooxml', 'Shared Office XML infrastructure.'], ['@tumblerjs/core', 'Selection, formatting contracts, sparse geometry, and editing history.'], ['@tumblerjs/formulas', 'Bounded spreadsheet formula parsing and evaluation.'], ['@tumblerjs/charts', 'DrawingML chart models shared by document formats.'], ['@tumblerjs/word', 'Word parsing, page layout, text editing, and formatting.'], ['@tumblerjs/sheets', 'Workbook models, calculations, cell edits, and formatting.'], ['@tumblerjs/svelte', 'Word, spreadsheet, chart, and formatting components.']] }
      ] },
      { id: 'ownership', title: 'What the application owns', blocks: [
        { kind: 'list', items: ['Loading files and reporting failures.', 'Saving exported bytes, downloads, and remote persistence.', 'Authentication and access to documents.', 'Navigation, surrounding controls, and external-link policy.', 'Selection and history, using Tumbler helpers where appropriate.'] },
        { kind: 'text', text: 'This playground supplies those controls without a backend. The document bytes stay in browser memory and are discarded when the page is reloaded.' }
      ] },
      { id: 'preservation', title: 'Edits and preservation', blocks: [
        { kind: 'text', text: 'Spreadsheet edits return new artifacts. Word can use an editing session that tracks artifact revisions and bounded undo history. Export writes the updated Office package; the rendered DOM is never the saved document.' },
        { kind: 'note', text: 'Preservation is a design goal, not a blanket compatibility guarantee. Unsupported content may not survive every edit. Keep the original file and verify important exports in their target Office application.' }
      ] }
    ], next: { href: '/docs/compatibility', label: 'Compatibility' }
  },
  word: {
    title: 'Word documents',
    description: 'Render paginated DOCX files, track text selection, and apply edits through a Word editing session.',
    sections: [
      { id: 'open', title: 'Open and render', blocks: [
        { kind: 'code', code: `import { openWordEditingSession } from '@tumblerjs/word';

const session = openWordEditingSession(bytes);
const document = session.artifact.document;` },
        { kind: 'text', text: 'WordDocumentView renders a window of pages around the visible area. Its scale prop controls zoom. Use bind:scale to keep your zoom controls in sync with trackpad pinch, Ctrl+wheel, and two-finger touch gestures. Gestures zoom between 25% and 300% around the pointer or touch midpoint. Each page centres within the viewer when it fits; wider pages remain horizontally scrollable.' }
      ] },
      { id: 'editing', title: 'Connect text edits', blocks: [
        { kind: 'text', text: 'The view reports an edit containing the selection, replacement text, and resulting caret. Apply it to the session and pass its next document back to the view. This minimal example uses single-paragraph edits; when inserting paragraph breaks, resolve the caret against the new paragraph list.' },
        { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import { openWordEditingSession, type WordTextSelection } from '@tumblerjs/word';
  import { WordDocumentView } from '@tumblerjs/svelte';

  let { bytes }: { bytes: Uint8Array } = $props();
  const session = openWordEditingSession(bytes);
  let artifact = $state(session.artifact);
  let selection = $state<WordTextSelection>();
</script>

<div style="height: 640px; min-width: 0">
  <WordDocumentView
    wordDocument={artifact.document}
    editable
    ondrawingchange={(change) => artifact = session.updateDrawing(change)}
    {selection}
    onselectionchange={(next) => selection = next}
    onedit={(edit) => {
      artifact = session.replaceText(edit.selection, edit.value);
      selection = { anchor: edit.caret, focus: edit.caret };
    }}
  />
</div>` }
      ] },
      { id: 'drawings', title: 'Move and resize images and charts', blocks: [
        { kind: 'text', text: 'Pass ondrawingchange to enable drawing controls in Edit mode. Drag the image or chart to place it on the page. Corner handles preserve proportions; edge handles adjust one dimension. Use the layout control for inline, in-front-of-text, or behind-text placement. Dragging an inline drawing moves it within the text flow without changing its layout. Arrow keys nudge a focused floating drawing, Shift makes larger steps, and Escape cancels a drag. Apply changes with session.updateDrawing(change) for undo, redo, and DOCX export. Square and tight text wrapping are not provided by these controls.' }
      ] },
      { id: 'formatting', title: 'Format a selection', blocks: [
        { kind: 'text', text: 'Read the selection formatting state from the artifact and use WORD_FORMATTING_CAPABILITIES with FormattingToolbar. Applying a patch records an undoable session revision.' },
        { kind: 'code', code: `session.applyFormatting(selection, {
  text: { bold: { set: true }, fontSize: { set: 16 } }
});

session.undo();
session.redo();` }
      ] },
      { id: 'export', title: 'Export the document', blocks: [
        { kind: 'code', code: `const output = session.artifact.bytes();
// Persist or download output before marking the revision saved.
session.markSaved();` },
        { kind: 'text', text: 'Internal bookmark links are handled by the viewer. External links are passed to onhyperlink; validate the target protocol before opening it.' }
      ] }
    ], next: { href: '/playground/word-brief', label: 'Try the Word playground' }
  },
  spreadsheets: {
    title: 'Spreadsheets',
    description: 'Render XLSX worksheets, edit values and formulas, and recalculate supported dependencies.',
    sections: [
      { id: 'render', title: 'Render a worksheet', blocks: [
        { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import { createGridSelection } from '@tumblerjs/core';
  import { openSpreadsheetArtifact } from '@tumblerjs/sheets';
  import { SpreadsheetGrid } from '@tumblerjs/svelte';

  let { bytes }: { bytes: Uint8Array } = $props();
  let artifact = $state(openSpreadsheetArtifact(bytes));
  let selection = $state(createGridSelection({ row: 1, column: 1 }));
</script>

<div class="sheet" style="height: 560px; min-width: 0">
  <SpreadsheetGrid
    worksheet={artifact.worksheet}
    calculation={artifact.calculation}
    {selection}
    onselectionchange={(next) => selection = next}
    onedit={(edit) => artifact = artifact.editCell(edit.reference, edit.value)}
  />
</div>

<style>
  .sheet :global(.tumbler-grid) { height: 100%; }
</style>` },
        { kind: 'text', text: 'SpreadsheetGrid supports trackpad pinch, Ctrl+wheel, and two-finger touch zoom from 25% to 300%. Bind its scale prop with bind:scale to synchronise your zoom controls. The grid, row and column headers, frozen panes, and cell editor scale together.' }
      ] },
      { id: 'formulas', title: 'Values and formulas', blocks: [
        { kind: 'text', text: 'Inline grid edits are literal values. SpreadsheetFormulaBar interprets a leading equals sign as a formula. The headless API takes formula source without that leading sign.' },
        { kind: 'code', code: `artifact = artifact
  .editCell('B2', 120)
  .editCell('B3', 80)
  .editFormula('B4', 'SUM(B2:B3)');

artifact.worksheet.cell('B4')?.formula; // SUM(B2:B3)
artifact.calculation.displayText('B4'); // 200` }
      ] },
      { id: 'sheets', title: 'Switch worksheets', blocks: [
        { kind: 'text', text: 'Selecting a sheet returns an artifact for that sheet without throwing away workbook edits. Use the sheet name or numeric identifier.' },
        { kind: 'code', code: `const sheets = artifact.workbook.sheets;
artifact = artifact.selectSheet(sheets[1]!.name);` }
      ] },
      { id: 'formatting', title: 'Formatting and export', blocks: [
        { kind: 'code', code: `artifact = artifact.applyFormatting('A1:D1', {
  text: { bold: { set: true } },
  block: { horizontalAlignment: { set: 'center' } }
});

const output = artifact.bytes();` },
        { kind: 'note', text: 'Ordinary formulas are editable. Shared, array, data-table, dynamic-array, and external-workbook formula structures are not currently editable.' }
      ] }
    ], next: { href: '/playground/sheet-budget', label: 'Try the spreadsheet playground' }
  },
  compatibility: {
    title: 'Compatibility',
    description: 'Tumbler is early alpha. Use the examples to inspect specific behavior, and test your own files before depending on a feature.',
    sections: [
      { id: 'formats', title: 'Current scope', blocks: [
        { kind: 'table', headers: ['Format', 'Available today', 'Limits'], rows: [['DOCX', 'Paginated rendering, text edits, formatting, tables, embedded images, and supported charts.', 'Incomplete Word layout and feature coverage. Font availability affects pagination.'], ['XLSX', 'Virtualized grid, cell and ordinary formula edits, formatting, tables, and supported charts.', 'Formula and workbook feature coverage remains incomplete.'], ['DOC / XLS', 'Not supported.', 'Convert legacy binary files to DOCX or XLSX first.'], ['PPTX', 'Local workspace preview with slide navigation, tables, shapes, images, charts, and bounded edits.', 'Not published yet. Table row/column operations, SmartArt relayout, 3D effects, and full animation/layout fidelity remain unsupported.'], ['PDF', 'No viewer in this playground.', 'PDF rendering is outside the current format packages.']] }
      ] },
      { id: 'checking', title: 'Check a real document', blocks: [
        { kind: 'list', items: ['Keep an unchanged original.', 'Open the file in the playground and inspect the content, page edges, and fonts.', 'Make a small edit and download the result.', 'Reopen the exported file in the application that will consume it.', 'Report a minimal, non-confidential example when something differs.'] },
        { kind: 'text', text: 'The repository includes package tests and compatibility workflows using LibreOffice and the Open XML SDK. Passing those checks is evidence for the exercised cases, not a guarantee for all Office files.' }
      ] },
      { id: 'privacy', title: 'Local files', blocks: [
        { kind: 'text', text: 'The playground reads selected files into browser memory. It does not upload them or save them to a server. Downloads are generated from the current in-memory artifact. Refreshing the page discards edits.' },
        { kind: 'text', text: 'The playground accepts DOCX and XLSX files up to 20 MB. External document links are not opened by this playground.' }
      ] }
    ], next: { href: '/docs/development', label: 'Local development' }
  },
  development: {
    title: 'Local development',
    description: 'Run the docs and playground against the source packages. No registry release or Kryptonote checkout is needed.',
    sections: [
      { id: 'run', title: 'Start the site', blocks: [
        { kind: 'code', language: 'Terminal', code: 'git clone https://github.com/Kryptonote-Labs/Tumbler.git\ncd Tumbler\nbun install\nbun run dev' },
        { kind: 'text', text: 'The SvelteKit application lives in apps/docs. Its dev command binds to 0.0.0.0, so you can open the network URL printed by Vite from another device on your LAN.' }
      ] },
      { id: 'examples', title: 'Repeatable examples', blocks: [
        { kind: 'text', text: 'Playground examples have stable URLs. Choose a narrow viewport to investigate overflow, switch to Edit to change content, and use Reset to reopen the original bytes. The sample documents are purpose-built MIT-licensed fixtures, with their generator in apps/docs/scripts.' },
        { kind: 'code', language: 'Terminal', code: 'bun run --cwd apps/docs samples\nbun run docs:check\nbun run docs:build\nbun run docs:test' },
        { kind: 'text', text: 'Install Playwright Chromium once with bunx playwright install chromium from apps/docs. Browser tests exercise the real viewer, including narrow-page scrolling and downloaded edits.' }
      ] },
      { id: 'deploy', title: 'Vercel deployment', blocks: [
        { kind: 'text', text: 'Use apps/docs as the Vercel root directory with the SvelteKit framework preset. Include source files outside the root directory so the workspace packages are available. Install from the repository root using bun install --frozen-lockfile, then build the app with bun run build.' },
        { kind: 'text', text: 'The site is prerendered. It needs no database, authentication service, or document storage. The displayed package version and commit identify the source used for each build.' }
      ] }
    ]
  }
};
