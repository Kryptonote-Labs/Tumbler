import type { Doc } from './types';

export const architectureDoc: Doc = {
  title: 'How it works',
  description: 'Tumbler separates Office package handling, document models, and the interface that renders them.',
  sections: [
    { id: 'flow', title: 'From file to view', blocks: [
        { kind: 'code', language: 'Data flow', code: `DOCX / XLSX / PPTX bytes
  → OPC package and XML
  → Word / Sheets / Slides artifact
  → Svelte components
  → edit operations
  → updated artifact and file bytes` },
        { kind: 'text', text: 'An artifact is the application boundary. It contains the document model and exposes operations for editing, formatting, and exporting. Svelte components display that model and report user actions back to your application.' },
    ] },
    { id: 'native-word', title: 'Word without a package', blocks: [
        { kind: 'text', text: 'NativeWordDocument also accepts an authored block tree directly. Reconciliation preserves unchanged paragraph identities; the shared Word layout engine caches geometry. DOCX packaging occurs when the application requests an artifact for export. Persistence and collaboration remain application responsibilities.' },
        { kind: 'link', href: '/docs/native-word', label: 'Build with the native Word model' },
    ] },
    { id: 'packages', title: 'Package responsibilities', blocks: [
        { kind: 'table', headers: ['Package', 'Responsibility'], rows: [
          ['@tumblerjs/opc', 'ZIP archives, package parts, relationships, and transactions.'],
          ['@tumblerjs/ooxml', 'Shared Office XML infrastructure.'],
          ['@tumblerjs/core', 'Selection, formatting contracts, sparse geometry, and editing history.'],
          ['@tumblerjs/formulas', 'Bounded spreadsheet formula parsing and evaluation.'],
          ['@tumblerjs/charts', 'DrawingML chart models shared by document formats.'],
          ['@tumblerjs/word', 'Word parsing, page layout, text editing, and formatting.'],
          ['@tumblerjs/sheets', 'Workbook models, calculations, cell edits, and formatting.'],
          ['@tumblerjs/slides', 'Presentation models, slide layouts, text and table-cell edits, and object transforms.'],
          ['@tumblerjs/svelte', 'Word, spreadsheet, presentation, chart, and formatting components.'],
        ] },
    ] },
    { id: 'ownership', title: 'What the application owns', blocks: [
        { kind: 'list', items: [
          'Loading files and reporting failures.',
          'Saving exported bytes, downloads, and remote persistence.',
          'Authentication and access to documents.',
          'Navigation, surrounding controls, and external-link policy.',
          'Selection and history, using Tumbler helpers where appropriate.',
        ] },
        { kind: 'text', text: 'This playground supplies those controls without a backend. The document bytes stay in browser memory and are discarded when the page is reloaded.' },
    ] },
    { id: 'preservation', title: 'Edits and preservation', blocks: [
        { kind: 'text', text: 'Spreadsheet edits return new artifacts. Word and PowerPoint can use an editing session that tracks artifact revisions and bounded undo history. Export writes the updated Office package; the rendered DOM is never the saved document.' },
        { kind: 'note', text: 'Preservation is a design goal, not a blanket compatibility guarantee. Unsupported content may not survive every edit. Keep the original file and verify important exports in their target Office application.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/architecture.ts',
};
