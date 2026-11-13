import type { Doc } from './types';

export const powerpointEditingDoc: Doc = {
  title: 'Edit slides',
  description: 'Let users edit text, tables, shapes and object positions, with undo.',
  sections: [
    { id: 'edits', title: 'Connect editing', blocks: [
      { kind: 'text', text: 'Open the file with `openPresentationEditingSession` instead of `openPresentationArtifact`. The session keeps an undo history, and each method returns the new artifact.' },
      { kind: 'text', text: 'To connect it, make the view `editable`, pass its callbacks to session methods, and assign each returned artifact back to your state.' },
      { kind: 'table', headers: ['Callback', 'Called when', 'Apply with'], rows: [
        ['`onobjectschange`', 'The user moves, resizes or rotates one or more objects.', 'A batch of `update-object` commands'],
        ['`ontextedit`', 'The user types or deletes text, including in table cells.', '`session.editText`'],
        ['`onformat`', 'The user formats selected text.', '`session.formatText`'],
        ['`onshapechange`', 'The user changes a shape\'s fill or outline.', '`session.styleShape`'],
        ['`onundo`', 'The user presses the undo or redo shortcut.', '`session.undo` or `session.redo`'],
      ] },
      { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import { untrack } from 'svelte';
  import { openPresentationEditingSession, type PresentationArtifact } from '@tumblerjs/slides';
  import { PresentationSlideView } from '@tumblerjs/svelte/slides';

  let { bytes }: { bytes: Uint8Array } = $props();
  const session = untrack(() => openPresentationEditingSession(bytes));
  let artifact = $state(session.artifact);
  let index = $state(0);
  let canUndo = $state(false);
  let canRedo = $state(false);
  let error = $state('');

  function apply(operation: () => PresentationArtifact) {
    try {
      artifact = operation();
      canUndo = session.canUndo;
      canRedo = session.canRedo;
      error = '';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not apply this edit.';
    }
  }
</script>

<button disabled={!canUndo} onclick={() => apply(() => session.undo())}>Undo</button>
<button disabled={!canRedo} onclick={() => apply(() => session.redo())}>Redo</button>
{#if error}<p role="alert">{error}</p>{/if}

<div style="height: 540px; min-width: 0">
  {#if artifact.document.slides[index]}
    <PresentationSlideView
      presentation={artifact.document}
      slide={artifact.document.slides[index]!}
      editable
      onobjectschange={(changes) => apply(() => session.execute({
        name: 'batch',
        commands: changes.map(({slideId, objectKey, x, y, width, height, rotation}) => ({
          name: 'update-object', slideId, objectKey, x, y, width, height,
          ...(rotation === undefined ? {} : {rotation}),
        })),
      }))}
      ontextedit={(change) => apply(() => session.editText(change))}
      onformat={(change) => apply(() => session.formatText(change))}
      onshapechange={(change) => apply(() => session.styleShape(change))}
      onundo={(redo) => apply(() => redo ? session.redo() : session.undo())}
    />
  {/if}
</div>` },
      { kind: 'text', text: 'The text and shape formatting controls only appear when `onformat` and `onshapechange` are connected. A session method throws if an edit is not allowed, so catch errors as `apply` does.' },
      { kind: 'text', text: 'To add thumbnails, pass `artifact.document` to `PresentationSlideRail` and bind it to the same `index`.' },
    ] },
    { id: 'controls', title: 'Editor controls', blocks: [
      { kind: 'table', headers: ['To', 'Do this'], rows: [
        ['Select several objects', 'Drag across empty space to draw a box around them. Shift-click adds or removes one object, and Shift-drag adds the boxed objects. Escape clears the selection.'],
        ['Move', 'Drag the selection, or use the arrow keys.'],
        ['Resize', 'Drag an edge or corner handle.'],
        ['Rotate', 'Drag the handle above the object. Hold Shift to snap to 15° steps.'],
        ['Edit text', 'Double-click a text box, or select it and press Enter. Select words to format them with the toolbar.'],
        ['Edit a table', 'Double-click a cell. Tab and Shift+Tab move between cells.'],
        ['Stop editing', 'Press Escape or Ctrl+Enter. Click empty space to clear the selection.'],
        ['Change shape colours', 'Select the shape, then use the fill and outline controls.'],
      ] },
    ] },
    { id: 'native-authoring', title: 'Edit with commands', blocks: [
      { kind: 'text', text: '`session.execute` runs named commands, the same ones the editor and the command-line tool use. Pass one command, or a `batch`.' },
      { kind: 'table', headers: ['Area', 'Commands'], rows: [
        ['Slides', '`insert-slide` (from a layout, or a copy with `sourceId`), `move-slide`, `delete-slide`, `set-slide-hidden`, `set-background`, `set-notes`'],
        ['Objects', '`insert-object`, `update-object`, `duplicate-object`, `delete-object`, `style-shape`, `insert-ink`'],
        ['Text', '`edit-text`, `format-text`, `replace-all`, `set-link`'],
        ['Tables', '`edit-table`, with an `action` of `insert-row`, `delete-row`, `insert-column`, `delete-column`, `merge` or `split`; `format-table`'],
        ['Pictures and charts', '`replace-picture`, `set-alt-text`, `insert-chart`, `edit-chart`'],
      ] },
      { kind: 'text', text: 'New slides use the layout\'s real placeholders, so they match the rest of the deck.' },
      { kind: 'text', text: 'Each command is one undo step. Wrap several commands in a `batch` to undo them together.' },
      { kind: 'text', text: 'For collaborative editing, your app sends commands between users. When a write is rejected because the deck changed, `rebasePresentationCommands` reapplies the pending commands to the newer deck. Overlapping text edits, or edits to a slide, object or table another user removed or changed, throw `PresentationRebaseConflict` instead of overwriting.' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/slides/README.md', label: 'Command schemas and collaboration setup' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint-editing.ts',
  next: { href: '/docs/powerpoint-export', label: 'Export a presentation' },
};
