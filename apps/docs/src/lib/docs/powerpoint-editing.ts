import type { Doc } from './types';

export const powerpointEditingDoc: Doc = {
  title: 'Edit slides',
  description: 'Connect text, table-cell, formatting, and object-transform edits to a session.',
  sections: [
    { id: 'edits', title: 'Connect editing', blocks: [
        { kind: 'text', text: 'Use an editing session instead of a read-only artifact. Set editable on the view and connect its callbacks to the session. Reassign the returned artifact after each edit so the view updates.' },
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
      onobjectchange={(change) => apply(() => session.updateObject(change))}
      ontextedit={(change) => apply(() => session.editText(change))}
      onformat={(change) => apply(() => session.formatText(change))}
      onshapechange={(change) => apply(() => session.styleShape(change))}
      onundo={(redo) => apply(() => redo ? session.redo() : session.undo())}
    />
  {/if}
</div>` },
        { kind: 'text', text: 'The text and shape formatting controls appear when their callbacks are connected. To add the thumbnail rail, pass artifact.document as its presentation and bind the same index used by the view.' },
    ] },
    { id: 'controls', title: 'Use the editor', blocks: [
        { kind: 'table', headers: ['Action', 'Control'], rows: [
          ['Move an object', 'Drag it, or select it and use the arrow keys.'],
          ['Resize or rotate', 'Drag an edge or corner handle to resize. Use the handle above the object to rotate; hold Shift to snap to 15° increments.'],
          ['Edit text', 'Double-click a text box, or select it and press Enter. Select words to apply formatting with the toolbar.'],
          ['Edit a table', 'Double-click a cell. Tab and Shift+Tab move between cells.'],
          ['Finish editing', 'Press Escape or Ctrl+Enter. Click blank slide space to clear the selection.'],
          ['Change shape colours', 'Select the shape, then use the fill and outline controls.'],
        ] },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint-editing.ts',
  next: { href: '/docs/powerpoint-export', label: 'Export a presentation' },
};
