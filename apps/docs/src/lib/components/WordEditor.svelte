<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { WordDocumentView, FormattingToolbar, wordDocumentParagraphs, type WordDocumentEdit } from '@tumblerjs/svelte';
  import { WORD_FORMATTING_CAPABILITIES, wordParagraphText, type WordEditingSession, type WordTextSelection } from '@tumblerjs/word';
  import type { FormattingPatch } from '@tumblerjs/core';
  let { session, editable, scale = $bindable(), onchange, onerror, ondownload }: {
    session: WordEditingSession; editable: boolean; scale: number;
    onchange: (bytes: Uint8Array, dirty: boolean) => void; onerror: (message: string) => void; ondownload: () => void;
  } = $props();
  let artifact = $state(untrack(() => session.artifact));
  let canUndo = $state(false);
  let canRedo = $state(false);
  let selection = $state<WordTextSelection>();
  let view = $state<WordDocumentView>();
  const selections = new WeakMap<object, WordTextSelection>();
  let formatting = $derived(selection ? artifact.formattingState(selection) : undefined);

  onMount(() => session.subscribe(change => {
    artifact = change.artifact;
    canUndo = session.canUndo;
    canRedo = session.canRedo;
    if (change.reason === 'undo' || change.reason === 'redo') selection = selections.get(artifact);
    onchange(artifact.bytes(), change.dirty);
  }));

  function edit(change: WordDocumentEdit) {
    try {
      selections.set(artifact, change.selection);
      const before = wordDocumentParagraphs(artifact.document);
      const index = before.findIndex(p => p.elementId === change.selection.anchor.paragraphElementId);
      session.replaceText(change.selection, change.value);
      const after = wordDocumentParagraphs(session.artifact.document);
      const lines = change.value.split('\n');
      const paragraph = lines.length > 1 ? after[index + lines.length - 1] : after.find(p => p.elementId === change.caret.paragraphElementId);
      if (paragraph) {
        const position = { paragraphElementId: paragraph.elementId, offset: Math.min(lines.length > 1 ? lines.at(-1)!.length : change.caret.offset, wordParagraphText(artifact.document, paragraph).length) };
        selection = { anchor: position, focus: position };
        selections.set(artifact, selection);
      }
      onerror('');
    } catch { onerror('This edit is not supported for the selected content.'); }
  }
  function format(patch: FormattingPatch) {
    if (!selection) return;
    try { selections.set(artifact, selection); session.applyFormatting(selection, patch); selections.set(session.artifact, selection); onerror(''); }
    catch { onerror('Could not format this selection.'); }
    view?.focusEditor();
  }
  function command(value: 'undo' | 'redo' | 'save') {
    if (value === 'save') { ondownload(); return; }
    if (selection) selections.set(artifact, selection);
    if (value === 'undo') session.undo(); else session.redo();
    view?.focusEditor();
  }
</script>
<div class="editor-root">
  {#if editable}
    <div class="editing-bar">
      <button onclick={() => command('undo')} disabled={!canUndo} title="Undo" aria-label="Undo">↶</button>
      <button onclick={() => command('redo')} disabled={!canRedo} title="Redo" aria-label="Redo">↷</button>
      {#if formatting}<FormattingToolbar state={formatting} capabilities={WORD_FORMATTING_CAPABILITIES} onformat={format} />{:else}<span class="selection-hint">Select text to format</span>{/if}
    </div>
  {/if}
  <div class="viewer-body"><WordDocumentView bind:this={view} wordDocument={artifact.document} {editable} bind:scale {selection} onselectionchange={next => selection = next} onedit={edit} oncommand={command} /></div>
</div>
