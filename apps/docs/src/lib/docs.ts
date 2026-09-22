export type Block =
  | { kind: 'text' | 'note'; text: string }
  | { kind: 'code'; code: string; language?: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'link'; href: string; label: string }
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
    description: 'Build a PPTX viewer or editor with Svelte 5. Open a file, add slide navigation, connect edits, and download the result.',
    sections: [
      { id: 'setup', title: 'Open a file', blocks: [
        { kind: 'text', text: 'Read your PPTX file into a Uint8Array. The examples below accept these bytes as a component prop.' },
        { kind: 'code', code: `const bytes = new Uint8Array(await file.arrayBuffer());` }
      ] },
      { id: 'viewer', title: 'Render a slide', blocks: [
        { kind: 'text', text: 'Open the bytes with openPresentationArtifact and pass its document and a slide to PresentationSlideView. Give the viewer a fixed height so it can size the slide.' },
        { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import { untrack } from 'svelte';
  import { openPresentationArtifact } from '@tumblerjs/slides';
  import { PresentationSlideView } from '@tumblerjs/svelte/slides';

  let { bytes }: { bytes: Uint8Array } = $props();
  const artifact = untrack(() => openPresentationArtifact(bytes));
  let scale = $state(1);
</script>

<div style="height: 540px; min-width: 0">
  {#if artifact.document.slides[0]}
    <PresentationSlideView
      presentation={artifact.document}
      slide={artifact.document.slides[0]}
      bind:scale
    />
  {/if}
</div>` },
        { kind: 'text', text: 'A scale of 1 fits the slide to the viewer. Bind scale to keep zoom controls in sync with pinch gestures. These examples open one file per component instance; remount the component when loading another file.' }
      ] },
      { id: 'navigation', title: 'Add slide navigation', blocks: [
        { kind: 'text', text: 'Bind PresentationSlideRail to an index and use that index for the main view. Handle onslide so links inside the presentation can switch slides too.' },
        { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import type { PresentationDocument } from '@tumblerjs/slides';
  import { PresentationSlideRail, PresentationSlideView } from '@tumblerjs/svelte/slides';

  let { presentation }: { presentation: PresentationDocument } = $props();
  let index = $state(0);
</script>

<div style="display: flex; height: 540px; min-width: 0">
  <aside style="width: 150px; flex-shrink: 0">
    <PresentationSlideRail {presentation} bind:index />
  </aside>
  <div style="flex: 1; min-width: 0">
    {#if presentation.slides[index]}
      <PresentationSlideView
        {presentation}
        slide={presentation.slides[index]!}
        onslide={(part) => {
          const next = presentation.slides.findIndex(slide => slide.part === part);
          if (next >= 0) index = next;
        }}
      />
    {/if}
  </div>
</div>` }
      ] },
      { id: 'edits', title: 'Connect editing', blocks: [
        { kind: 'text', text: 'Use an editing session instead of a read-only artifact. Set editable on the view and connect its callbacks to the session. Reassign the returned artifact after each edit so the view updates.' },
        { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import { untrack } from 'svelte';
  import { openPresentationEditingSession, type PresentationArtifact } from '@tumblerjs/slides';
  import { PresentationSlideView } from '@tumblerjs/svelte/slides';

  let { bytes }: { bytes: Uint8Array } = $props();
  const session = untrack(() => openPresentationEditingSession(bytes));
  let artifact = $state(session.artifact);
  let index = $state(0);
  let canUndo = $state(false);
  let canRedo = $state(false);
  let error = $state('');

  function apply(operation: () => PresentationArtifact) {
    try {
      artifact = operation();
      canUndo = session.canUndo;
      canRedo = session.canRedo;
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not apply this edit.';
    }
  }
</script>

<button disabled={!canUndo} onclick={() => apply(() => session.undo())}>Undo</button>
<button disabled={!canRedo} onclick={() => apply(() => session.redo())}>Redo</button>
{#if error}<p role="alert">{error}</p>{/if}

<div style="height: 540px; min-width: 0">
  {#if artifact.document.slides[index]}
    <PresentationSlideView
      presentation={artifact.document}
      slide={artifact.document.slides[index]!}
      editable
      onobjectchange={(change) => apply(() => session.updateObject(change))}
      ontextedit={(change) => apply(() => session.editText(change))}
      onformat={(change) => apply(() => session.formatText(change))}
      onshapechange={(change) => apply(() => session.styleShape(change))}
      onundo={(redo) => apply(() => redo ? session.redo() : session.undo())}
    />
  {/if}
</div>` },
        { kind: 'text', text: 'The text and shape formatting controls appear when their callbacks are connected. To add the thumbnail rail, pass artifact.document as its presentation and bind the same index used by the view.' }
      ] },
      { id: 'controls', title: 'Use the editor', blocks: [
        { kind: 'table', headers: ['Action', 'Control'], rows: [
          ['Move an object', 'Drag it, or select it and use the arrow keys.'],
          ['Resize or rotate', 'Drag an edge or corner handle to resize. Use the handle above the object to rotate; hold Shift to snap to 15° increments.'],
          ['Edit text', 'Double-click a text box, or select it and press Enter. Select words to apply formatting with the toolbar.'],
          ['Edit a table', 'Double-click a cell. Tab and Shift+Tab move between cells.'],
          ['Finish editing', 'Press Escape or Ctrl+Enter. Click blank slide space to clear the selection.'],
          ['Change shape colours', 'Select the shape, then use the fill and outline controls.']
        ] }
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
        { kind: 'link', href: '/docs/compatibility#powerpoint', label: 'PowerPoint format support and limitations' }
      ] }
    ], next: { href: '/playground/slides-brief', label: 'Try the editor with an example deck' }
  },
  installation: {
    title: 'Installation',
    description: 'Add Tumbler to a Svelte 5 application. Parsing and editing run in the browser; your application owns loading and saving files.',
    sections: [
      { id: 'packages', title: 'Install the packages', blocks: [
        { kind: 'text', text: 'Install the Svelte components and the format packages you need. All public Tumbler packages share one version. Keep them on the same release.' },
        { kind: 'code', language: 'Terminal', code: 'bun add @tumblerjs/svelte @tumblerjs/word @tumblerjs/sheets @tumblerjs/slides @tumblerjs/core' },
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
        { kind: 'text', text: 'The document models do not depend on a UI framework. Use the Word, Sheets, or Slides package directly when building another renderer, inspecting documents, or applying edits.' },
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
        { kind: 'code', language: 'Data flow', code: 'DOCX / XLSX / PPTX bytes\n  → OPC package and XML\n  → Word / Sheets / Slides artifact\n  → Svelte components\n  → edit operations\n  → updated artifact and file bytes' },
        { kind: 'text', text: 'An artifact is the application boundary. It contains the document model and exposes operations for editing, formatting, and exporting. Svelte components display that model and report user actions back to your application.' }
      ] },
      { id: 'packages', title: 'Package responsibilities', blocks: [
        { kind: 'table', headers: ['Package', 'Responsibility'], rows: [['@tumblerjs/opc', 'ZIP archives, package parts, relationships, and transactions.'], ['@tumblerjs/ooxml', 'Shared Office XML infrastructure.'], ['@tumblerjs/core', 'Selection, formatting contracts, sparse geometry, and editing history.'], ['@tumblerjs/formulas', 'Bounded spreadsheet formula parsing and evaluation.'], ['@tumblerjs/charts', 'DrawingML chart models shared by document formats.'], ['@tumblerjs/word', 'Word parsing, page layout, text editing, and formatting.'], ['@tumblerjs/sheets', 'Workbook models, calculations, cell edits, and formatting.'], ['@tumblerjs/slides', 'Presentation models, slide layouts, text and table-cell edits, and object transforms.'], ['@tumblerjs/svelte', 'Word, spreadsheet, presentation, chart, and formatting components.']] }
      ] },
      { id: 'ownership', title: 'What the application owns', blocks: [
        { kind: 'list', items: ['Loading files and reporting failures.', 'Saving exported bytes, downloads, and remote persistence.', 'Authentication and access to documents.', 'Navigation, surrounding controls, and external-link policy.', 'Selection and history, using Tumbler helpers where appropriate.'] },
        { kind: 'text', text: 'This playground supplies those controls without a backend. The document bytes stay in browser memory and are discarded when the page is reloaded.' }
      ] },
      { id: 'preservation', title: 'Edits and preservation', blocks: [
        { kind: 'text', text: 'Spreadsheet edits return new artifacts. Word and PowerPoint can use an editing session that tracks artifact revisions and bounded undo history. Export writes the updated Office package; the rendered DOM is never the saved document.' },
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
        { kind: 'table', headers: ['Format', 'Available today', 'Limits'], rows: [['DOCX', 'Paginated rendering, text edits, formatting, tables, embedded images, and supported charts.', 'Incomplete Word layout and feature coverage. Font availability affects pagination.'], ['XLSX', 'Virtualized grid, cell and ordinary formula edits, formatting, tables, and supported charts.', 'Formula and workbook feature coverage remains incomplete.'], ['DOC / XLS / PPT', 'Not supported.', 'Convert legacy binary files to DOCX, XLSX, or PPTX first.'], ['PPTX', 'Slide viewing, thumbnail navigation, text and table-cell editing, formatting, and object movement, resizing, and rotation.', 'Table row/column operations, SmartArt relayout, 3D effects, and full animation/layout fidelity remain unsupported.'], ['PDF', 'No viewer in this playground.', 'PDF rendering is outside the current format packages.']] }
      ] },
      { id: 'powerpoint', title: 'PowerPoint support', blocks: [
        { kind: 'table', headers: ['Content', 'Support and limits'], rows: [
          ['Text and fonts', 'Rich text, bullets, hyperlinks, tab stops, autofit, and embedded fonts. Browser text layout can differ from Office, especially with missing fonts.'],
          ['Shapes and pictures', 'Preset and custom shapes, grouped transforms, theme colours, gradients, cropping, tiling, common drawing effects, and supported raster, SVG, EMF, and WMF images. 3D effects are not supported.'],
          ['Tables', 'Built-in Office styles, merged cells, cell text and formatting edits, and table resizing. Inserting or deleting rows and columns is not supported.'],
          ['Charts', 'Supported OOXML chart types include stacked, percentage-stacked, and combination charts. Chart-data editing is not provided by the slide editor.'],
          ['Navigation and media', 'Slide links, speaker notes, and browser playback for embedded audio and video. Media playback depends on browser codec support.'],
          ['Animations', 'Preview controls for fade, appear, and wipe. Complex timing and full PowerPoint playback are not supported.'],
          ['Editing', 'Move, resize, rotate, and edit supported slide objects, including grouped objects and placeholders with inherited geometry. Native ink and its picture fallback move together.'],
          ['Read-only content', 'Shared master/layout objects, fields, signed presentations, SmartArt cached drawings, and unknown alternate representations. Saved SmartArt drawings can render, but diagram relayout is not implemented.'],
          ['Saving', 'Edits retain unrelated package parts, relationships, notes, and embedded files. Export without edits returns the original bytes. Edited ZIPs may omit directory records.']
        ] },
        { kind: 'link', href: '/docs/powerpoint', label: 'Build a PowerPoint viewer or editor' }
      ] },
      { id: 'checking', title: 'Check a real document', blocks: [
        { kind: 'list', items: ['Keep an unchanged original.', 'Open the file in the playground and inspect the content, page edges, and fonts.', 'Make a small edit and download the result.', 'Reopen the exported file in the application that will consume it.', 'Report a minimal, non-confidential example when something differs.'] },
        { kind: 'text', text: 'The repository includes package tests and compatibility workflows using LibreOffice and the Open XML SDK. Passing those checks is evidence for the exercised cases, not a guarantee for all Office files.' }
      ] },
      { id: 'privacy', title: 'Local files', blocks: [
        { kind: 'text', text: 'The playground reads selected files into browser memory. It does not upload them or save them to a server. Downloads are generated from the current in-memory artifact. Refreshing the page discards edits.' },
        { kind: 'text', text: 'The playground accepts DOCX, XLSX, and PPTX files up to 20 MB. External links in presentations can open in a new tab in View mode; clicking linked text in Edit mode edits the text.' }
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
