import type { Doc } from './types';

export const wordEditingDoc: Doc = {
  title: 'Open and edit Word files',
  description: 'Render pages, connect text edits, and save a DOCX.',
  sections: [
    { id: 'open', title: 'Open and render', blocks: [
        { kind: 'code', code: `import { openWordEditingSession } from '@tumblerjs/word';

const session = openWordEditingSession(bytes);
const document = session.artifact.document;` },
        { kind: 'text', text: 'WordDocumentView renders a window of pages around the visible area. Its scale prop controls zoom. Use bind:scale to keep your zoom controls in sync with trackpad pinch, Ctrl+wheel, and two-finger touch gestures.' },
        { kind: 'text', text: 'Gestures zoom between 25% and 300% around the pointer or touch midpoint. Each page centres within the viewer when it fits; wider pages remain horizontally scrollable.' },
    ] },
    { id: 'editing', title: 'Connect text edits', blocks: [
        { kind: 'text', text: 'The view reports an edit containing the selection, replacement text, and resulting caret. Apply it to the session and pass its next document back to the view.' },
        { kind: 'text', text: 'This minimal example uses single-paragraph edits; when inserting paragraph breaks, resolve the caret against the new paragraph list.' },
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
</div>` },
    ] },
    { id: 'export', title: 'Export the document', blocks: [
        { kind: 'code', code: `const output = session.artifact.bytes();
// Persist or download output before marking the revision saved.
session.markSaved();` },
        { kind: 'text', text: 'Internal bookmark links are handled by the viewer. External links are passed to onhyperlink; validate the target protocol before opening it.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-editing.ts',
  next: { href: '/docs/native-word', label: 'Native content model' },
};
