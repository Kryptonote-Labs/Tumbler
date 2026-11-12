import { version } from '../site';
import type { Doc } from './types';

export const installationDoc: Doc = {
  title: 'Installation',
  description: 'Add Tumbler to a Svelte 5 application. Parsing and editing run in the browser; your application owns loading and saving files.',
  sections: [
    { id: 'packages', title: 'Install the packages', blocks: [
        { kind: 'text', text: `Install the packages you need. The current release is ${version}. Keep all Tumbler packages on the same version.` },
        { kind: 'code', language: 'Terminal', code: `bun add @tumblerjs/svelte @tumblerjs/word @tumblerjs/sheets @tumblerjs/slides @tumblerjs/core` },
        { kind: 'note', text: 'Tumbler is early alpha. The latest distribution tag points to the current alpha release. APIs and format coverage are still changing.' },
    ] },
    { id: 'typescript-runtime', title: 'TypeScript and runtime requirements', blocks: [
      { kind: 'text', text: 'Tumbler packages export TypeScript source. Use a bundler or runtime that handles .ts modules and ES2024 library typings. This minimal consumer tsconfig works with TypeScript 5.9.3; target can remain ES2022.' },
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
      { kind: 'note', text: 'For TypeScript consumers of @tumblerjs/word, also install yjs. It is an optional runtime peer, but the current public entry point exposes collaboration types that TypeScript must resolve even for a basic Word import.' },
      { kind: 'text', text: 'Merge the lib setting into your framework tsconfig when it already provides module and file-inclusion settings. skipLibCheck skips declaration files, so it does not hide errors in published .ts sources. lib provides typings only; target controls syntax emission. Neither setting adds polyfills for newer built-ins.' },
      { kind: 'text', text: 'Your runtime must provide String.prototype.isWellFormed, Array.prototype.toSorted, toReversed, findLast and findLastIndex. Text editing/search also uses Intl.Segmenter, and model operations use structuredClone. Check these APIs in your supported browsers, webviews and server runtimes, or load suitable polyfills before importing Tumbler. Browser rendering also requires DOM, Canvas and font APIs. These API prerequisites are not a tested minimum browser-version guarantee.' },
      { kind: 'link', href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/isWellFormed#browser_compatibility', label: 'String API compatibility' },
      { kind: 'link', href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted#browser_compatibility', label: 'Array API compatibility' },
      { kind: 'link', href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter#browser_compatibility', label: 'Intl.Segmenter compatibility' },
    ] },
    { id: 'host-styles', title: 'Scope host styles', blocks: [
      { kind: 'text', text: 'Scope application button styles to your own controls, such as .app-toolbar button. Global button min-height or padding rules can stretch inline document hyperlink buttons and distort text layout. Check the viewer with your application CSS reset and theme.' },
    ] },
    { id: 'pdf-cli', title: 'PDF and the CLI', blocks: [
      { kind: 'text', text: 'Add @tumblerjs/pdf for PDF processing or install @tumblerjs/cli globally for the tumbler command. The CLI requires Bun 1.3 or later.' },
      { kind: 'link', href: '/docs/pdf', label: 'PDF engine and viewer' },
      { kind: 'link', href: '/docs/cli', label: 'CLI installation and usage' },
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
{/if}` },
    ] },
    { id: 'headless', title: 'Use the model without Svelte', blocks: [
        { kind: 'text', text: 'The document models do not depend on a UI framework. Use the Word, Sheets, or Slides package directly when building another renderer, inspecting documents, or applying edits.' },
        { kind: 'code', code: `import { openSpreadsheetArtifact } from '@tumblerjs/sheets';

const artifact = openSpreadsheetArtifact(bytes);
const edited = artifact.editCell('B2', 42);
const output = edited.bytes();` },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/installation.ts',
  next: { href: '/docs/word', label: 'Word overview' },
};
