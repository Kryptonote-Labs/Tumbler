import type { Doc } from './types';

export const releasesDoc: Doc = {
  title: 'Release 0.1.0-alpha.27',
  description: 'How to upgrade, what changed since alpha.26, and what to update in your code.',
  sections: [
    { id: 'install', title: 'Install this release', blocks: [
      { kind: 'text', text: 'All 12 `@tumblerjs` packages share version 0.1.0-alpha.27, published under the `latest` tag. Upgrade every Tumbler package you use at the same time.' },
      { kind: 'code', language: 'Terminal', code: 'bun add \\\n  @tumblerjs/word@0.1.0-alpha.27 \\\n  @tumblerjs/sheets@0.1.0-alpha.27 \\\n  @tumblerjs/slides@0.1.0-alpha.27 \\\n  @tumblerjs/svelte@0.1.0-alpha.27 \\\n  @tumblerjs/core@0.1.0-alpha.27' },
      { kind: 'text', text: 'If you use PDF or the command-line tool:' },
      { kind: 'code', language: 'Terminal', code: 'bun add @tumblerjs/pdf@0.1.0-alpha.27\nbun add --global @tumblerjs/cli@0.1.0-alpha.27' },
    ] },
    { id: 'migration', title: 'Update your code', blocks: [
      { kind: 'text', text: 'These changes can affect existing code:' },
      { kind: 'table', headers: ['Change', 'What to do'], rows: [
        ['New Word shapes now float in front of the text at a fixed position on the page.', 'Set `layout: \'inline\'` to keep the old behaviour.'],
        ['`paragraphPositioning` now returns only what the paragraph itself declares.', 'Use `document.styles.paragraphFormat` for the values that actually apply, including inherited ones.'],
        ['Ink decoding moved to `@tumblerjs/ink`.', 'Import from its public exports instead of internal Word modules.'],
        ['CLI `--value` now turns `\\n`, `\\r`, `\\t` and `\\\\` into the characters they stand for.', 'Add `--literal` to keep backslashes, or use `--value-file`.'],
      ] },
      { kind: 'text', text: 'Also fixed: clearing formatting no longer brings the removed formatting back on export.' },
    ] },
    { id: 'changes', title: 'What changed', blocks: [
      { kind: 'table', headers: ['Area', 'New in this release'], rows: [
        ['Packages', '`@tumblerjs/ink`, `@tumblerjs/pdf` and `@tumblerjs/cli` are now public. All 12 packages share one version.'],
        ['Word', 'Ink, shared typed operations, page and section setup, embedded fonts, canvas rendering and pages that appear as they are laid out. Better preservation, concurrent editing and export speed.'],
        ['Spreadsheets', 'Building and restructuring workbooks with commands, drawings, a function list with autocomplete, print views, other users\' selections, and canvas rendering without a browser.'],
        ['PowerPoint', 'Creating decks and slides, adding and removing table rows and columns, notes and links, ink, selecting several objects, collaboration, canvas previews and PDF export.'],
        ['Charts', 'Editing chart data and properties in all three formats, pattern, picture and gradient fills, 3D charts, manual layout, rich titles, and fixes to axes and labels.'],
        ['PDF', 'Rendering, selectable text, search, collaborative text formatting and annotations, extracting, deleting, inserting and merging pages, images, links and bookmarks.'],
        ['CLI', 'Shared operations for every format, chart editing, rendered previews, help generated from the operations, and exact replacement text from a file or standard input.'],
      ] },
      { kind: 'link', href: '/changelog/0.1.0-alpha.27', label: 'Full changelog' },
    ] },
    { id: 'qualification', title: 'How releases are checked', blocks: [
      { kind: 'text', text: 'Before publishing, a release must pass:' },
      { kind: 'list', items: [
        'package metadata validation, type checking and package tests;',
        'the docs checks and production docs build;',
        'installing all 12 packed packages into a test app.',
      ] },
      { kind: 'text', text: 'Only the exact commit that passed, once it is on `main`, is published. Packages go out one at a time in dependency order, skipping versions that already exist, and every version and `latest` tag is checked afterwards.' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/CONTRIBUTING.md', label: 'Release procedure' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/releases.ts',
};
