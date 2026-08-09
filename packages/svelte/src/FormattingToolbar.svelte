<script lang="ts">
  import type {
    FormattingCapabilities,
    FormattingPatch,
    FormattingState,
    HorizontalAlignment,
  } from "@tumblerjs/core";
  import {
    colorFormatting,
    fontSizeFormatting,
    formattingColorValue,
    toggleBooleanFormatting,
    toggleUnderlineFormatting,
  } from "./formatting-controls.ts";

  interface Props {
    readonly state: FormattingState;
    readonly capabilities: FormattingCapabilities;
    readonly onformat?: (patch: FormattingPatch) => void;
    readonly disabled?: boolean;
  }

  let { state, capabilities, onformat, disabled = false }: Props = $props();
  let fontSize = $derived(
    state.text.fontSize.state === "value" || state.text.fontSize.state === "inherited"
      ? String(state.text.fontSize.value)
      : "",
  );
  let color = $derived(formattingColorValue(state.text.color));
  let bold = $derived(activeBoolean(state.text.bold));
  let italic = $derived(activeBoolean(state.text.italic));
  let underline = $derived(
    (state.text.underline.state === "value" || state.text.underline.state === "inherited") &&
      state.text.underline.value !== "none",
  );
  let alignment = $derived(
    state.block.horizontalAlignment.state === "value" || state.block.horizontalAlignment.state === "inherited"
      ? state.block.horizontalAlignment.value
      : undefined,
  );

  function activeBoolean(value: FormattingState["text"]["bold"]): boolean {
    return (value.state === "value" || value.state === "inherited") && value.value;
  }

  function apply(patch: FormattingPatch | undefined) {
    if (patch !== undefined && !disabled) onformat?.(patch);
  }

  function setAlignment(value: HorizontalAlignment) {
    apply({ block: { horizontalAlignment: { set: value } } });
  }
</script>

<div class="formatting-toolbar" role="toolbar" aria-label="Formatting">
  {#if capabilities.text.fontSize !== false}
    <input
      class:mixed={state.text.fontSize.state === "mixed"}
      type="number"
      min={capabilities.text.fontSize.minimum}
      max={capabilities.text.fontSize.maximum}
      step="0.5"
      value={fontSize}
      placeholder={state.text.fontSize.state === "mixed" ? "—" : undefined}
      aria-label="Font size"
      title="Font size"
      disabled={disabled}
      onchange={(event) => apply(fontSizeFormatting(event.currentTarget.value))}
    />
  {/if}
  {#if capabilities.text.bold}
    <button
      type="button"
      class:active={bold}
      class:mixed={state.text.bold.state === "mixed"}
      aria-label="Bold"
      aria-pressed={bold}
      title="Bold"
      disabled={disabled}
      onclick={() => apply(toggleBooleanFormatting("bold", state.text.bold))}
    ><strong>B</strong></button>
  {/if}
  {#if capabilities.text.italic}
    <button
      type="button"
      class:active={italic}
      class:mixed={state.text.italic.state === "mixed"}
      aria-label="Italic"
      aria-pressed={italic}
      title="Italic"
      disabled={disabled}
      onclick={() => apply(toggleBooleanFormatting("italic", state.text.italic))}
    ><em>I</em></button>
  {/if}
  {#if capabilities.text.underline !== false}
    <button
      type="button"
      class:active={underline}
      class:mixed={state.text.underline.state === "mixed"}
      aria-label="Underline"
      aria-pressed={underline}
      title="Underline"
      disabled={disabled}
      onclick={() => apply(toggleUnderlineFormatting(state.text.underline))}
    ><span class="underline">U</span></button>
  {/if}
  {#if capabilities.text.color}
    <label class="color-control" title="Text colour" style:--format-color={color}>
      <span aria-hidden="true">A</span>
      <input
        type="color"
        value={color}
        aria-label="Text colour"
        disabled={disabled}
        onchange={(event) => apply(colorFormatting(event.currentTarget.value))}
      />
    </label>
  {/if}
  {#if capabilities.block.horizontalAlignment !== false}
    <span class="separator" aria-hidden="true"></span>
    {#each capabilities.block.horizontalAlignment.filter((value) => value !== "justify") as value}
      <button
        class="alignment"
        class:active={alignment === value}
        class:mixed={state.block.horizontalAlignment.state === "mixed"}
        type="button"
        aria-label={`Align ${value}`}
        aria-pressed={alignment === value}
        title={`Align ${value}`}
        disabled={disabled}
        onclick={() => setAlignment(value)}
      ><span class={value} aria-hidden="true"><i></i><i></i><i></i></span></button>
    {/each}
  {/if}
</div>

<style>
  .formatting-toolbar {
    display: flex;
    min-width: 0;
    height: 40px;
    box-sizing: border-box;
    align-items: center;
    gap: 3px;
    padding: 4px 8px;
    overflow-x: auto;
    border-bottom: 1px solid var(--tumbler-grid-line, #2a302a);
    color: var(--tumbler-grid-fg, #d8e2d8);
    background: var(--tumbler-grid-bg, #111411);
    scrollbar-width: none;
    font: 13px/1 system-ui, sans-serif;
  }
  .formatting-toolbar::-webkit-scrollbar { display: none; }
  button, .color-control, input[type="number"] {
    flex: 0 0 auto;
    box-sizing: border-box;
    height: 30px;
    border: 1px solid transparent;
    border-radius: 4px;
    color: inherit;
    background: transparent;
    font: inherit;
  }
  button { display: grid; width: 30px; padding: 0; place-items: center; cursor: pointer; }
  button:hover, .color-control:hover, input[type="number"]:hover { background: var(--tumbler-grid-header-bg, #181c18); }
  button.active { border-color: color-mix(in srgb, var(--tumbler-grid-accent, #42ff53) 55%, transparent); background: color-mix(in srgb, var(--tumbler-grid-accent, #42ff53) 12%, transparent); }
  button.mixed::after { position: absolute; width: 12px; height: 2px; margin-top: 20px; background: currentColor; content: ""; opacity: 0.65; }
  button { position: relative; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--tumbler-grid-accent, #42ff53); outline-offset: -2px; }
  button:disabled, input:disabled { cursor: default; opacity: 0.5; }
  input[type="number"] { width: 58px; padding: 0 7px; border-color: var(--tumbler-grid-line, #2a302a); outline: 0; }
  input[type="number"].mixed { color: var(--tumbler-grid-muted, #9aa79a); }
  .underline { text-decoration: underline; text-underline-offset: 2px; }
  .color-control { position: relative; display: grid; width: 34px; place-items: center; cursor: pointer; font-weight: 650; }
  .color-control::after { position: absolute; right: 7px; bottom: 4px; left: 7px; height: 3px; border-radius: 2px; background: var(--format-color, currentColor); content: ""; }
  .color-control input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .separator { width: 1px; height: 20px; margin: 0 3px; background: var(--tumbler-grid-line, #2a302a); }
  .alignment > span { display: flex; width: 15px; height: 13px; flex-direction: column; gap: 2px; }
  .alignment i { display: block; width: 100%; height: 1px; background: currentColor; }
  .alignment .start i:nth-child(2) { width: 65%; }
  .alignment .center { align-items: center; }
  .alignment .center i:nth-child(2) { width: 65%; }
  .alignment .end { align-items: flex-end; }
  .alignment .end i:nth-child(2) { width: 65%; }
</style>
