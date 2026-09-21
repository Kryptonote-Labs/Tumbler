<script lang="ts">
  import { untrack } from "svelte";
  import {
    PresentationSlideView,
    PresentationSlideRail,
  } from "@tumblerjs/svelte/slides";
  import type {
    PresentationArtifact,
    PresentationEditingSession,
  } from "@tumblerjs/slides";
  let {
    session,
    editable,
    scale = $bindable(1),
    onchange,
    onerror,
  }: {
    session: PresentationEditingSession;
    editable: boolean;
    scale?: number;
    onchange: (bytes: () => Uint8Array, dirty: boolean) => void;
    onerror: (message: string) => void;
  } = $props();
  let artifact = $state(untrack(() => session.artifact));
  let index = $state(0);
  let selectedKey = $state<string>();
  let canUndo = $state(false),
    canRedo = $state(false);
  let slide = $derived(artifact.document.slides[index]);
  let selected = $derived(
    slide?.objects.find((object) => object.key === selectedKey),
  );
  function apply(operation: () => PresentationArtifact) {
    try {
      artifact = operation();
      canUndo = session.canUndo;
      canRedo = session.canRedo;
      const committed = artifact;
      onchange(() => committed.bytes(), session.dirty);
      onerror("");
    } catch (cause) {
      onerror(
        cause instanceof Error ? cause.message : "Could not apply this edit.",
      );
    }
  }
</script>

<div class="presentation-editor">
  <div class="slide-toolbar">
    <button
      aria-label="Previous slide"
      disabled={index === 0}
      onclick={() => index--}>←</button
    >
    <select aria-label="Slide" bind:value={index}
      >{#each artifact.document.slides as item, i}<option value={i}
          >{i + 1}. {item.title}{item.hidden ? " (hidden)" : ""}</option
        >{/each}</select
    >
    <button
      aria-label="Next slide"
      disabled={index >= artifact.document.slides.length - 1}
      onclick={() => index++}>→</button
    >
    {#if editable}<span class="spacer"></span><button
        disabled={!canUndo}
        onclick={() => apply(() => session.undo())}>Undo</button
      ><button disabled={!canRedo} onclick={() => apply(() => session.redo())}
        >Redo</button
      >{/if}
  </div>
  <div class="slide-workspace">
    <aside>
      <PresentationSlideRail presentation={artifact.document} bind:index />
    </aside>
    <div class="slide-stage">
      {#if slide}<PresentationSlideView
          onslide={(part) => {
            const next = artifact.document.slides.findIndex(
              (slide) => slide.part === part,
            );
            if (next >= 0) index = next;
          }}
          presentation={artifact.document}
          {slide}
          {editable}
          bind:scale
          bind:selectedKey
          ontextedit={(change) => apply(() => session.editText(change))}
          onformat={(change) => apply(() => session.formatText(change))}
          onshapechange={(change) => apply(() => session.styleShape(change))}
          onundo={(redo) =>
            apply(() => (redo ? session.redo() : session.undo()))}
          onobjectchange={(change) => apply(() => session.updateObject(change))}
          ontextchange={(change) =>
            apply(() =>
              session.replaceText(
                change.slideId,
                change.objectKey,
                change.value,
              ),
            )}
        />
      {:else}<p>This presentation has no slides.</p>{/if}
    </div>
  </div>
  {#if editable}<div class="selection-status" aria-live="polite">
      {selected?.restriction ??
        (selected?.table
          ? "Double-click a cell to edit · Tab moves between cells · Drag the border to move or handles to resize"
          : selected?.textEditable
            ? "Drag to move · Double-click or Enter to edit text · Ctrl+Enter or Escape finishes"
            : selected?.movable
              ? "Drag to move · Handles resize and rotate · Shift snaps rotation · Arrow keys nudge"
              : "Select an object to edit it.")}
    </div>{/if}
  {#if slide?.notes}<details class="notes">
      <summary>Speaker notes</summary>
      <p>{slide.notes}</p>
    </details>{/if}
  {#if slide?.diagnostics.length}<details>
      <summary
        >{slide.diagnostics.length} preview {slide.diagnostics.length === 1
          ? "limitation"
          : "limitations"}</summary
      >
      <ul>
        {#each slide.diagnostics as diagnostic}<li>
            {diagnostic.message}
          </li>{/each}
      </ul>
    </details>{/if}
</div>

<style>
  .presentation-editor {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .slide-toolbar {
    display: flex;
    gap: 6px;
    padding: 8px;
    align-items: center;
    background: var(--surface);
    flex-wrap: wrap;
  }
  .slide-toolbar button,
  select {
    min-height: 28px;
    padding: 4px 8px;
    font-size: 11px;
  }
  select {
    min-width: 0;
    max-width: min(52vw, 350px);
    flex: 1;
  }
  .spacer {
    flex: 1;
  }
  .slide-workspace {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    container-type: inline-size;
  }
  aside {
    width: clamp(96px, 18%, 190px);
    flex-shrink: 0;
    min-height: 0;
  }
  .slide-stage {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .selection-status {
    padding: 7px 10px;
    font-size: 11px;
    color: var(--soft);
    background: var(--surface);
    min-height: 30px;
  }
  details {
    max-height: 120px;
    overflow: auto;
    padding: 7px 10px;
    font-size: 11px;
    color: var(--soft);
    background: var(--surface);
  }
  .notes p {
    white-space: pre-wrap;
    line-height: 1.5;
  }
  summary {
    cursor: pointer;
  }
</style>
