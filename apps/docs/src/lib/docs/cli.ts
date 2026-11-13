import type { Doc } from './types';

export const cliDoc: Doc = {
  title: 'Command-line editing',
  description: 'Read and edit Word, Excel, PowerPoint and PDF files from a terminal or a script.',
  sections: [
    { id: 'install', title: 'Install', blocks: [
      { kind: 'text', text: 'The `tumbler` command needs Bun 1.3 or later. It uses the same engines as the editors, so an edit made here matches one made in the UI.' },
      { kind: 'code', language: 'Terminal', code: 'bun add --global @tumblerjs/cli\ntumbler --help\ntumbler draft.docx --help' },
      { kind: 'text', text: 'Help is generated from the operations each file type supports, so `tumbler <file> --help` always lists what you can do to that file.' },
      { kind: 'code', language: 'Terminal', code: 'tumbler create draft.docx\ntumbler draft.docx read\ntumbler draft.docx inspect --input \'{"what":"styles"}\'' },
    ] },
    { id: 'edit', title: 'Read, then edit', blocks: [
      { kind: 'text', text: '`read` prints the document with a handle for each page. Pass a handle from a fresh `read` to your edit, so the edit applies to the version you looked at.' },
      { kind: 'code', language: 'Terminal', code: 'tumbler draft.docx replace --page \'<handle from read>\' --find \'draft\' --value \'final\'\ntumbler draft.docx format --help\ntumbler draft.docx edit-object --help' },
      { kind: 'text', text: 'An edit fails without writing anything when:' },
      { kind: 'list', items: [
        'an input is not recognised;',
        'the text you are looking for matches in more than one place;',
        'the file changed since you read it.',
      ] },
      { kind: 'text', text: 'The file is locked while it is written, and replaced in one step, so a failed write never leaves half a file.' },
      { kind: 'text', text: 'Word files support structured edits to headers and footers, formatting, styles, lists, tables, drawings and ink. Spreadsheets and presentations accept the same commands as `applySpreadsheetCommand` and `applyPresentationCommand`. Run `--help` on an operation to see its fields, units and examples.' },
    ] },
    { id: 'values', title: 'Replacement text', blocks: [
      { kind: 'table', headers: ['Flag', 'Reads'], rows: [
        ['`--value text`', 'The text, with `\\n`, `\\r`, `\\t` and `\\\\` turned into a newline, carriage return, tab and backslash.'],
        ['`--value text --literal`', 'The text exactly as typed, backslashes included.'],
        ['`--value-file path`', 'The exact contents of a UTF-8 file, including trailing newlines.'],
        ['`--value-file -`', 'The same, from standard input.'],
      ] },
      { kind: 'code', language: 'Terminal', code: 'tumbler draft.docx replace --page \'<handle>\' --find old --value-file replacement.txt' },
      { kind: 'text', text: 'Empty replacement text deletes the target. JSON passed with `--input` follows normal JSON escaping only.' },
    ] },
    { id: 'pdf', title: 'PDF pages', blocks: [
      { kind: 'code', language: 'Terminal', code: 'tumbler source.pdf export --pages 3,1-2 --output selected.pdf\ntumbler report.pdf pdf delete-pages --help\ntumbler first.pdf pdf merge --source second.pdf --output merged.pdf' },
      { kind: 'list', items: [
        'Page numbers start at 1, and a range such as `1-2` includes both ends.',
        '`export` writes the pages you list to a new file, in the order you list them.',
        '`delete-pages` edits the file in place. It cannot delete every page, and rejects PDFs with attachments, metadata or page labels.',
        '`merge` can repeat pages and files.',
      ] },
      { kind: 'note', text: 'Deleting pages is not redaction. Do not rely on it to remove sensitive content.' },
      { kind: 'link', href: '/docs/pdf-merge', label: 'Merge PDF pages' },
    ] },
    { id: 'charts', title: 'Charts', blocks: [
      { kind: 'text', text: '`charts read` lists a file\'s charts and their source data. `charts edit` changes a chart\'s data or properties, and fails if the chart changed since you read it. Both work on DOCX, XLSX and PPTX files.' },
      { kind: 'code', language: 'Terminal', code: 'tumbler report.docx charts read\ntumbler report.docx charts edit --help' },
      { kind: 'link', href: '/docs/charts', label: 'Charts' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/cli/README.md', label: 'Full command reference' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/cli.ts',
};
