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
    {selection}
    onselectionchange={(next) => selection = next}
    onedit={(edit) => {
      artifact = session.replaceText(edit.selection, edit.value);
      selection = { anchor: edit.caret, focus: edit.caret };
    }}
  />
</div>` }
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
        { kind: 'table', headers: ['Format', 'Available today', 'Limits'], rows: [['DOCX', 'Paginated rendering, text edits, formatting, tables, embedded images, and supported charts.', 'Incomplete Word layout and feature coverage. Font availability affects pagination.'], ['XLSX', 'Virtualized grid, cell and ordinary formula edits, formatting, tables, and supported charts.', 'Formula and workbook feature coverage remains incomplete.'], ['DOC / XLS', 'Not supported.', 'Convert legacy binary files to DOCX or XLSX first.'], ['PPTX / PDF', 'No viewer in this playground.', 'Do not interpret shared package parsing as rendering support.']] }
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
