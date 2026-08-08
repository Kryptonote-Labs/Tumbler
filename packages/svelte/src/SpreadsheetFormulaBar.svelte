<script lang="ts">
  import type { SpreadsheetWorksheet } from "@tumblerjs/sheets";
  import { spreadsheetFormulaBarEdit, spreadsheetFormulaBarText, type SpreadsheetFormulaBarEdit } from "./spreadsheet-formula-bar.ts";

  interface Props {
    readonly worksheet: SpreadsheetWorksheet;
    readonly reference: string;
    readonly onedit?: (edit: SpreadsheetFormulaBarEdit) => boolean | void;
    readonly readonly?: boolean;
  }

  let { worksheet, reference, onedit, readonly = false }: Props = $props();
  let draft = $state("");
  let input = $state<HTMLInputElement>();

  $effect(() => {
    draft = spreadsheetFormulaBarText(worksheet.cell(reference));
  });

  function commit() {
    if (readonly || onedit === undefined) return;
    const accepted = onedit(spreadsheetFormulaBarEdit(reference, draft, worksheet.cell(reference)));
    if (accepted !== false) input?.blur();
  }

  function cancel() {
    draft = spreadsheetFormulaBarText(worksheet.cell(reference));
    input?.blur();
  }

  function handleKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }
</script>

<form class="formula-bar" aria-label="Formula bar" onsubmit={(event) => { event.preventDefault(); commit(); }}>
  <output class="cell-reference" aria-label="Selected cell">{reference}</output>
  <span class="formula-mark" aria-hidden="true">fx</span>
  <input
    bind:this={input}
    bind:value={draft}
    aria-label={`Value or formula for ${reference}`}
    autocomplete="off"
    spellcheck="false"
    disabled={readonly || onedit === undefined}
    onkeydown={handleKeydown}
  />
</form>

<style>
  .formula-bar { display: grid; grid-template-columns: minmax(64px, auto) 32px minmax(0, 1fr); min-width: 0; height: 32px; box-sizing: border-box; color: var(--tumbler-grid-fg, #d8e2d8); background: var(--tumbler-grid-bg, #111411); border-bottom: 1px solid var(--tumbler-grid-line, #2a302a); font: 13px/1.3 system-ui, sans-serif; }
  .cell-reference, .formula-mark { display: grid; min-width: 0; place-items: center; box-sizing: border-box; border-right: 1px solid var(--tumbler-grid-line, #2a302a); }
  .cell-reference { justify-content: start; padding: 0 10px; color: var(--tumbler-grid-fg, #d8e2d8); }
  .formula-mark { color: var(--tumbler-grid-muted, #9aa79a); font-style: italic; }
  input { min-width: 0; border: 0; outline: 0; padding: 0 10px; color: var(--tumbler-grid-fg, #d8e2d8); background: transparent; font: inherit; user-select: text; -webkit-user-select: text; }
  input:focus { box-shadow: inset 0 -2px var(--tumbler-grid-accent, #42ff53); }
  input:disabled { opacity: 0.65; }
</style>
