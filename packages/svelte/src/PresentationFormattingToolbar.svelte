<script lang="ts">
  import FormattingToolbar from "./FormattingToolbar.svelte";
  import {
    presentationFormattingCapabilities,
    slideColorHex,
    type SlideObject,
    type PresentationShapeStyle,
  } from "@tumblerjs/slides";
  import type { FormattingState, FormattingPatch } from "@tumblerjs/core";
  let {
    object,
    state,
    onformat,
    onshape,
  }: {
    object?: SlideObject;
    state: FormattingState;
    onformat: (patch: FormattingPatch) => void;
    onshape: (patch: PresentationShapeStyle) => void;
  } = $props();
  let shape = $derived(object?.kind === "shape" && !object.restriction);
</script>

<div class="presentation-formatting">
  <FormattingToolbar
    {state}
    capabilities={presentationFormattingCapabilities}
    disabled={!object?.textEditable}
    {onformat}
  />
  {#if shape}
    <div class="shape-controls" role="group" aria-label="Shape formatting">
      <label
        >Fill<input
          aria-label="Shape fill colour"
          type="color"
          value={slideColorHex(object?.fill ?? "")}
          onchange={(e) => onshape({ fill: e.currentTarget.value })}
        /></label
      >
      <button
        title="No fill"
        aria-label="No shape fill"
        onpointerdown={(e) => e.preventDefault()}
        onclick={() => onshape({ fill: "none" })}>None</button
      >
      <label
        >Outline<input
          aria-label="Shape outline colour"
          type="color"
          value={slideColorHex(object?.stroke ?? "")}
          onchange={(e) => onshape({ stroke: e.currentTarget.value })}
        /></label
      >
      <button
        title="No outline"
        aria-label="No shape outline"
        onpointerdown={(e) => e.preventDefault()}
        onclick={() => onshape({ stroke: "none" })}>None</button
      >
      <input
        aria-label="Outline width"
        title="Outline width in points"
        type="number"
        min="0"
        max="100"
        step="0.25"
        value={((object?.strokeWidth ?? 0) * 3) / 4}
        onchange={(e) =>
          onshape({ strokeWidth: Number(e.currentTarget.value) })}
      />
    </div>
  {/if}
</div>

<style>
  .presentation-formatting {
    display: flex;
    flex: none;
    height: 41px;
    min-height: 41px;
    box-sizing: border-box;
    overflow-x: auto;
    overflow-y: hidden;
    background: var(--tumbler-grid-bg, #111411);
    color: var(--tumbler-grid-fg, #d8e2d8);
    border-bottom: 1px solid var(--tumbler-grid-line, #2a302a);
  }
  .presentation-formatting :global(.formatting-toolbar) {
    flex: none;
    border: 0;
    overflow: visible;
  }
  .shape-controls {
    box-sizing: border-box;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-left: 1px solid var(--tumbler-grid-line, #2a302a);
    font: 12px system-ui;
    white-space: nowrap;
  }
  label {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  input[type="color"] {
    box-sizing: border-box;
    min-height: 0;
    width: 26px;
    height: 26px;
    padding: 2px;
    border: 1px solid #485249;
    background: transparent;
  }
  input[type="number"] {
    width: 55px;
  }
  button,
  input[type="number"] {
    height: 28px;
    border: 1px solid #485249;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    padding: 3px 6px;
  }
  button {
    cursor: pointer;
  }
</style>
