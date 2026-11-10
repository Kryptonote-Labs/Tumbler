<script lang="ts">
  import { tick } from "svelte";
  import { spreadsheetFormulaCompletion, acceptSpreadsheetFormulaCompletion, type SpreadsheetFormulaCompletion } from "./spreadsheet-formula-completion.ts";

  let { input, disabled = false, oncomplete }: {
    input?: HTMLInputElement;
    disabled?: boolean;
    oncomplete: (draft: string, caret: number) => void;
  } = $props();
  const id = $props.id();
  let completion = $state<SpreadsheetFormulaCompletion>();
  let active = $state(0);
  let panel = $state<HTMLDivElement>();
  let position = $state("");
  let composing = false;
  let dismissed = "";
  let last = "";
  const key = () => `${input?.value}:${input?.selectionStart}:${input?.selectionEnd}`;

  function refresh() {
    if (!input || disabled || composing || document.activeElement !== input || key() === dismissed) return;
    if (key() !== last) active = 0;
    last = key();
    completion = spreadsheetFormulaCompletion(input.value, input.selectionStart ?? 0, input.selectionEnd ?? 0);
  }
  function close() {
    dismissed = key();
    completion = undefined;
  }
  function accept(name: string) {
    if (!input || !completion) return;
    const inserted = acceptSpreadsheetFormulaCompletion(input.value, completion, name);
    close();
    oncomplete(inserted.draft, inserted.caret);
    void tick().then(() => { dismissed = key(); });
  }
  function keydown(event: KeyboardEvent) {
    if (event.isComposing || composing || !completion || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "ArrowDown") active = (active + 1) % completion.names.length;
    else if (event.key === "ArrowUp") active = (active - 1 + completion.names.length) % completion.names.length;
    else if ((event.key === "Tab" && !event.shiftKey) || event.key === "Enter") accept(completion.names[active]!);
    else if (event.key === "Escape") close();
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void tick().then(() => panel?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }));
  }
  $effect(() => {
    const element = input;
    if (!element || disabled) { completion = undefined; return; }
    composing = false;
    dismissed = last = "";
    const attributes = ["role", "aria-autocomplete", "aria-controls", "aria-expanded", "aria-activedescendant"];
    const original = attributes.map(name => element.getAttribute(name));
    element.setAttribute("role", "combobox");
    element.setAttribute("aria-autocomplete", "list");
    element.setAttribute("aria-controls", id);
    const begin = () => { composing = true; completion = undefined; };
    const end = () => { composing = false; refresh(); };
    for (const name of ["input", "click", "select", "keyup", "focus"]) element.addEventListener(name, refresh);
    element.addEventListener("keydown", keydown, true);
    element.addEventListener("blur", close);
    element.addEventListener("compositionstart", begin);
    element.addEventListener("compositionend", end);
    refresh();
    return () => {
      for (const name of ["input", "click", "select", "keyup", "focus"]) element.removeEventListener(name, refresh);
      element.removeEventListener("keydown", keydown, true);
      element.removeEventListener("blur", close);
      element.removeEventListener("compositionstart", begin);
      element.removeEventListener("compositionend", end);
      attributes.forEach((name, index) => { const value = original[index]; if (value === null || value === undefined) element.removeAttribute(name); else element.setAttribute(name, value); });
    };
  });
  $effect(() => {
    input?.setAttribute("aria-expanded", String(!!completion));
    if (completion) input?.setAttribute("aria-activedescendant", `${id}-${active}`);
    else input?.removeAttribute("aria-activedescendant");
  });
  $effect(() => {
    if (!panel || !input || !completion) return;
    panel.showPopover();
    const bounds = input.getBoundingClientRect();
    const height = Math.min(240, panel.scrollHeight);
    const above = window.innerHeight - bounds.bottom < height + 8 && bounds.top > height + 8;
    position = `left:${Math.max(8, Math.min(bounds.left, window.innerWidth - panel.offsetWidth - 8))}px;top:${above ? bounds.top - height - 4 : bounds.bottom + 4}px;max-height:${Math.max(30, Math.min(240, above ? bounds.top - 12 : window.innerHeight - bounds.bottom - 12))}px`;
  });
</script>

<svelte:window onresize={close} onscrollcapture={(event) => { if (!(event.target instanceof Node && panel?.contains(event.target))) close(); }} />
{#if completion && !disabled}
  <div bind:this={panel} {id} class="formula-completions" style={position} popover="manual" role="listbox" aria-label="Function suggestions">
    {#each completion.names as name, index (name)}
      <button type="button" role="option" tabindex="-1" id={`${id}-${index}`} data-index={index} aria-selected={index === active}
        onpointerdown={(event) => event.preventDefault()} onmousedown={(event) => event.preventDefault()}
        onpointermove={() => active = index} onclick={() => accept(name)}>{name}</button>
    {/each}
  </div>
{/if}
<style>
  .formula-completions { position: fixed; inset: auto; margin: 0; width: min(280px, calc(100vw - 16px)); box-sizing: border-box; overflow-y: auto; padding: 4px; border: 1px solid var(--tumbler-grid-line, #303630); border-radius: 6px; background: var(--tumbler-grid-bg, #111411); color: var(--tumbler-grid-fg, #d8e2d8); box-shadow: 0 6px 20px #0004; font: 13px/1.4 system-ui, sans-serif; }
  button { display: block; width: 100%; min-height: 30px; padding: 5px 9px; border: 0; border-radius: 3px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
  button[aria-selected="true"] { background: var(--tumbler-grid-selection, #42ff5324); }
</style>
