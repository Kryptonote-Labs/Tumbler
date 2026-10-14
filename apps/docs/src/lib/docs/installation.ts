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
