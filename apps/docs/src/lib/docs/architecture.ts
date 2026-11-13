import type { Doc } from './types';

export const architectureDoc: Doc = {
  title: 'How it works',
  description: 'How a file becomes a model, a view, and a file again, and which package does what.',
  sections: [
    { id: 'flow', title: 'From file to view and back', blocks: [
      { kind: 'code', language: 'Data flow', code: `DOCX / XLSX / PPTX bytes
  → OPC package and XML
  → Word / Sheets / Slides artifact
  → Svelte components
  → edit operations
  → updated artifact and file bytes` },
      { kind: 'text', text: 'Office files are ZIP archives of XML parts. Tumbler reads the archive and its XML, then builds an artifact: the document model plus the methods for editing and exporting it.' },
      { kind: 'text', text: 'The Svelte components display an artifact and report what the user does. Your app applies those actions to the artifact, which returns a new one, and passes it back to the components.' },
      { kind: 'note', text: 'Export builds the file from the current artifact, not from the screen. Apply every edit callback to the artifact before you save.' },
    ] },
    { id: 'native-word', title: 'Word without a file', blocks: [
      { kind: 'text', text: '`NativeWordDocument` can also start from plain content blocks instead of a file. Paragraphs that did not change keep their identity between updates, and layout reuses their measurements. The DOCX is only built when you export.' },
      { kind: 'link', href: '/docs/native-word', label: 'Native content model' },
    ] },
    { id: 'pdf', title: 'PDF', blocks: [
      { kind: 'text', text: 'PDF is not an Office format, so it has its own reader and interpreter. They produce page scenes for canvas drawing and text selection. Collaborative editing keeps track of which original object each piece of text came from.' },
      { kind: 'link', href: '/docs/pdf', label: 'PDF documents' },
    ] },
    { id: 'packages', title: 'Packages', blocks: [
      { kind: 'table', headers: ['Package', 'Handles'], rows: [
        ['`@tumblerjs/word`', 'Word parsing, page layout, text editing and formatting.'],
        ['`@tumblerjs/sheets`', 'Workbooks, calculation, cell edits and formatting.'],
        ['`@tumblerjs/slides`', 'Presentations, slide layouts, text and table edits, and moving objects.'],
        ['`@tumblerjs/pdf`', 'PDF reading, drawing, editing and page assembly.'],
        ['`@tumblerjs/charts`', 'The chart model shared by all three Office formats.'],
        ['`@tumblerjs/formulas`', 'Spreadsheet formula parsing and evaluation.'],
        ['`@tumblerjs/ink`', 'Office ink drawings.'],
        ['`@tumblerjs/core`', 'Selections, formatting types, geometry and undo history shared by the others.'],
        ['`@tumblerjs/opc`', 'ZIP archives, package parts and relationships.'],
        ['`@tumblerjs/ooxml`', 'Office XML reading and writing.'],
        ['`@tumblerjs/svelte`', 'Components for documents, spreadsheets, slides, PDFs, charts and formatting.'],
        ['`@tumblerjs/cli`', 'The `tumbler` command, built on the same engines.'],
      ] },
    ] },
    { id: 'ownership', title: 'What your app provides', blocks: [
      { kind: 'list', items: [
        'Loading files, and telling the user when one fails to open.',
        'Saving, downloading and uploading the exported bytes.',
        'Sign-in and access control.',
        'Navigation, the controls around the document, and which links are safe to open.',
        'Selection and undo history. Tumbler has helpers for both.',
      ] },
      { kind: 'text', text: 'This docs site does all of that in the browser, with no server. Files you open stay in memory and are gone when you reload.' },
    ] },
    { id: 'preservation', title: 'Edits and preservation', blocks: [
      { kind: 'text', text: 'Spreadsheet edits return a new artifact. Word and PowerPoint also offer an editing session, which keeps the history of artifacts so edits can be undone.' },
      { kind: 'note', text: 'Tumbler tries to keep content it does not understand, but cannot guarantee it survives every edit. Keep the original file, and check important exports in the Office app that will open them.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/architecture.ts',
};
