import { version } from '../site';
import type { Doc } from './types';

export const installationDoc: Doc = {
  title: 'Installation',
  description: 'Add Tumbler to a Svelte 5 app and show your first document.',
  sections: [
    { id: 'packages', title: 'Install the packages', blocks: [
      { kind: 'text', text: `Install the packages for the formats you need. The current release is ${version}.` },
      { kind: 'code', language: 'Terminal', code: `bun add @tumblerjs/svelte @tumblerjs/word @tumblerjs/sheets @tumblerjs/slides @tumblerjs/core` },
      { kind: 'table', headers: ['Package', 'For'], rows: [
        ['`@tumblerjs/svelte`', 'The Svelte components.'],
        ['`@tumblerjs/word`', 'Word documents (DOCX).'],
        ['`@tumblerjs/sheets`', 'Spreadsheets (XLSX).'],
        ['`@tumblerjs/slides`', 'Presentations (PPTX).'],
        ['`@tumblerjs/core`', 'Types the others share, such as selections.'],
        ['`@tumblerjs/pdf`', 'PDF files. Optional.'],
        ['`@tumblerjs/cli`', 'The `tumbler` command. Install it globally; it needs Bun 1.3 or later.'],
      ] },
      { kind: 'note', text: 'Tumbler is in early alpha, and its APIs are still changing. Keep every Tumbler package on the same version.' },
      { kind: 'text', text: 'Tumbler does not read or write files itself. Your app decides where files come from and where they are saved.' },
    ] },
    { id: 'typescript-runtime', title: 'TypeScript and runtime requirements', blocks: [
      { kind: 'text', text: 'Tumbler packages publish TypeScript source. Your bundler or runtime must handle `.ts` modules and ES2024 library typings.' },
      { kind: 'text', text: 'This minimal tsconfig works with TypeScript 5.9.3:' },
      { kind: 'code', language: 'JSON', code: `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}` },
      { kind: 'list', items: [
        'If your framework already has a tsconfig, merge in the `lib` setting.',
        '`lib` provides typings only, and `target` controls the syntax that is emitted. Neither adds polyfills.',
        '`skipLibCheck` skips declaration files only, so errors in Tumbler\'s `.ts` sources are still reported.',
      ] },
      { kind: 'note', text: 'If you use `@tumblerjs/word` from TypeScript, also install `yjs`. It is an optional runtime peer, but the public entry point exposes collaboration types that TypeScript must resolve even for a basic Word import.' },
      { kind: 'text', text: 'Your runtime must provide these APIs, or load polyfills before importing Tumbler:' },
      { kind: 'list', items: [
        '`String.prototype.isWellFormed`;',
        '`Array.prototype.toSorted`, `toReversed`, `findLast` and `findLastIndex`;',
        '`Intl.Segmenter`, for text editing and search;',
        '`structuredClone`, for model operations;',
        'DOM, Canvas and font APIs, for rendering in the browser.',
      ] },
      { kind: 'text', text: 'Check them in the browsers, webviews and server runtimes you support. This is a list of required APIs, not a tested minimum browser version.' },
      { kind: 'link', href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/isWellFormed#browser_compatibility', label: 'String API compatibility' },
      { kind: 'link', href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted#browser_compatibility', label: 'Array API compatibility' },
      { kind: 'link', href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter#browser_compatibility', label: 'Intl.Segmenter compatibility' },
    ] },
    { id: 'host-styles', title: 'Scope your button styles', blocks: [
      { kind: 'text', text: 'Scope your app\'s button styles to your own controls, for example `.app-toolbar button`. A global `min-height` or `padding` on `button` also stretches the buttons Tumbler uses for links inside documents, which distorts the text layout.' },
      { kind: 'text', text: 'Check the viewer with your app\'s CSS reset and theme applied.' },
    ] },
    { id: 'first-document', title: 'Show a Word document', blocks: [
      { kind: 'text', text: 'This component lets the user pick a DOCX file and shows it as pages. `openWordArtifact` takes the file\'s bytes as a `Uint8Array` and throws if it cannot read them.' },
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
{/if}` },
      { kind: 'text', text: 'Give the view\'s container a height. The pages scroll inside it instead of making the page taller.' },
    ] },
    { id: 'headless', title: 'Use Tumbler without Svelte', blocks: [
      { kind: 'text', text: 'The format packages do not depend on Svelte or the browser. Use them on their own to inspect files, edit them in a script or on a server, or build a different UI.' },
      { kind: 'code', code: `import { openSpreadsheetArtifact } from '@tumblerjs/sheets';

const artifact = openSpreadsheetArtifact(bytes);
const edited = artifact.editCell('B2', 42);
const output = edited.bytes();` },
      { kind: 'link', href: '/docs/pdf', label: 'PDF documents' },
      { kind: 'link', href: '/docs/cli', label: 'Command-line editing' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/installation.ts',
  next: { href: '/docs/word', label: 'Word documents' },
};
