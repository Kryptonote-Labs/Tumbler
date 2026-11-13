import type { Doc } from './types';

export const wordEditingDoc: Doc = {
  title: 'Open and edit Word files',
  description: 'Show a DOCX as pages, let users edit it, and save the result.',
  sections: [
    { id: 'open', title: 'Open a file', blocks: [
      { kind: 'text', text: '`openWordEditingSession` opens DOCX bytes and keeps an undo history. Its `artifact` is the current version of the file, and `artifact.document` is what the view displays.' },
      { kind: 'code', code: `import { openWordEditingSession } from '@tumblerjs/word';

const session = openWordEditingSession(bytes);
const document = session.artifact.document;` },
      { kind: 'text', text: '`WordDocumentView` only renders the pages near the visible area, so long documents stay fast. A page narrower than the view is centred; a wider one scrolls sideways.' },
    ] },
    { id: 'zoom', title: 'Zoom', blocks: [
      { kind: 'text', text: 'Users can zoom from 25% to 300% with a trackpad pinch, `Ctrl` + mouse wheel, or a two-finger pinch. Zoom centres on the pointer or between the fingers.' },
      { kind: 'text', text: 'To add your own zoom controls, use `bind:scale`, where `1` is 100%. The bound value and the gestures stay in sync.' },
    ] },
    { id: 'editing', title: 'Let users edit', blocks: [
      { kind: 'text', text: 'Make the view `editable` and handle its callbacks. The view does not change the document itself: it reports what the user did, you apply it to the session, and you pass the new document back.' },
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
      { kind: 'table', headers: ['Callback', 'Receives', 'Apply with'], rows: [
        ['`onedit`', 'The selection, the replacement text and where the caret ends up.', '`session.replaceText`'],
        ['`ondrawingchange`', 'A moved, resized or rotated picture or shape.', '`session.updateDrawing`'],
        ['`onselectionchange`', 'The new selection.', 'Store it and pass it back as `selection`.'],
        ['`oncommand`', '`\'undo\'`, `\'redo\'` or `\'save\'` from the keyboard or browser.', 'Your own undo, redo and save.'],
      ] },
      { kind: 'note', text: 'This example handles edits within one paragraph. When an edit inserts a paragraph break, work out the caret position against the new list of paragraphs.' },
    ] },
    { id: 'browser-input', title: 'How browser input is handled', blocks: [
      { kind: 'list', items: [
        'Browser formatting shortcuts and drag-and-drop are cancelled. Apply formatting through your own controls instead.',
        'Typing and deleting use the browser\'s target range, so the edit matches what the user selected.',
        'Input the browser does not let Tumbler cancel is compared with the document and corrected.',
        'With an input method (IME), the composed text is applied once, when composition ends. Cancelling restores the original text.',
      ] },
      { kind: 'note', text: 'Native input methods on each operating system still need testing.' },
    ] },
    { id: 'export', title: 'Save', blocks: [
      { kind: 'text', text: '`session.artifact.bytes()` returns the DOCX with all edits. Once you have stored or downloaded it, call `markSaved` so the session knows there are no unsaved changes.' },
      { kind: 'code', code: `const output = session.artifact.bytes();
// Store or download output first.
session.markSaved();` },
    ] },
    { id: 'links', title: 'Links', blocks: [
      { kind: 'text', text: 'Links to bookmarks inside the document are followed by the view. Links to anything else are passed to `onhyperlink`.' },
      { kind: 'note', text: 'Check the link\'s protocol before opening it. A document can contain `javascript:` or other unsafe links.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-editing.ts',
  next: { href: '/docs/native-word', label: 'Native content model' },
};
