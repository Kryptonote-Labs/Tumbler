<script lang="ts">
  import { tick } from "svelte";
  import type { SpreadsheetWorksheet } from "@tumblerjs/sheets";
  import { insertSpreadsheetFormulaFunction, spreadsheetFormulaBarEdit, spreadsheetFormulaBarText, type SpreadsheetFormulaBarEdit } from "./spreadsheet-formula-bar.ts";
  import { spreadsheetCellUsesTextFormat } from "./spreadsheet-edit.ts";
  import {
    insertSpreadsheetFormulaReference,
    spreadsheetFormulaReferenceText,
    type SpreadsheetFormulaReferencePick,
    type SpreadsheetFormulaTextSpan,
  } from "./spreadsheet-formula-reference.ts";

  interface Props {
    readonly worksheet: SpreadsheetWorksheet;
    readonly reference: string;
    /** A host-issued grid selection event used while authoring a formula. */
    readonly referencePick?: SpreadsheetFormulaReferencePick;
    readonly onedit?: (edit: SpreadsheetFormulaBarEdit) => boolean | void;
    readonly oneditingchange?: (editing: boolean) => void;
    readonly readonly?: boolean;
    /** Turns the fx mark into a button that asks the host to open its function picker beside `anchor`. */
    readonly onfunctions?: (anchor: HTMLElement) => void;
    /** Whether the host's function picker is open, for the fx button's expanded state. */
    readonly functionsOpen?: boolean;
  }

  let { worksheet, reference, referencePick, onedit, oneditingchange, readonly = false, onfunctions, functionsOpen = false }: Props = $props();
  let draft = $state("");
  let input = $state<HTMLInputElement>();
  let authoring = $state(false);
  let targetWorksheet = $state<SpreadsheetWorksheet>();
  let targetReference = $state("");
  let selectionStart = $state(0);
  let selectionEnd = $state(0);
  let lastReferencePickId = $state<number>();
  let insertedReferenceSpan = $state<SpreadsheetFormulaTextSpan>();
  let functionInsertable = $derived(
    !readonly && onedit !== undefined && targetWorksheet !== undefined && !spreadsheetCellUsesTextFormat(targetWorksheet, targetReference),
  );
  let targetLabel = $derived(
    targetWorksheet === undefined || targetWorksheet.sheet === worksheet.sheet
      ? targetReference || reference
      : `${targetWorksheet.sheet.name}!${targetReference}`,
  );

  $effect(() => {
    const currentWorksheet = worksheet;
    const currentReference = reference;
    if (authoring) return;
    targetWorksheet = currentWorksheet;
    targetReference = currentReference;
    draft = spreadsheetFormulaBarText(currentWorksheet.cell(currentReference));
    selectionStart = draft.length;
    selectionEnd = draft.length;
    insertedReferenceSpan = undefined;
    lastReferencePickId = referencePick?.id;
  });

  $effect(() => {
    const pick = referencePick;
    if (!authoring || !draft.startsWith("=") || pick === undefined || pick.id === lastReferencePickId || targetWorksheet === undefined || spreadsheetCellUsesTextFormat(targetWorksheet, targetReference)) return;
    lastReferencePickId = pick.id;
    const insertion = insertSpreadsheetFormulaReference(
      draft,
      spreadsheetFormulaReferenceText(pick, targetWorksheet.sheet.name),
      selectionStart,
      selectionEnd,
      insertedReferenceSpan,
    );
    draft = insertion.draft;
    selectionStart = insertion.selectionStart;
    selectionEnd = insertion.selectionEnd;
    insertedReferenceSpan = insertion.insertedSpan;
    void tick().then(() => input?.setSelectionRange(selectionStart, selectionEnd));
  });

  /**
   * Inserts `NAME()` at the caret of the uncommitted draft and focuses the bar with
   * the caret inside the parentheses, so grid picks fill its arguments. Outside an
   * edit it replaces the cell's contents, which Escape restores. Returns false
   * when the target cannot hold a formula (read-only or Text formatted).
   */
  export function insertFunction(name: string): boolean {
    if (!functionInsertable) return false;
    // An unedited constant is replaced; an edited draft or any formula keeps its text around the caret.
    const replace = !authoring || (!draft.startsWith("=") && draft === committedText());
    if (!authoring) {
      authoring = true;
      oneditingchange?.(true);
      lastReferencePickId = referencePick?.id;
    }
    const insertion = insertSpreadsheetFormulaFunction(replace ? "" : draft, name, selectionStart, selectionEnd);
    draft = insertion.draft;
    selectionStart = insertion.selectionStart;
    selectionEnd = insertion.selectionEnd;
    insertedReferenceSpan = undefined;
    void tick().then(() => {
      if (input === undefined) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(insertion.selectionStart, insertion.selectionEnd);
      rememberSelection(input);
    });
    return true;
  }

  function committedText() {
    return targetWorksheet === undefined ? "" : spreadsheetFormulaBarText(targetWorksheet.cell(targetReference));
  }

  function commit() {
    if (readonly || onedit === undefined || targetWorksheet === undefined) return;
    const accepted = onedit(spreadsheetFormulaBarEdit(
      targetReference,
      draft,
      targetWorksheet.cell(targetReference),
      targetWorksheet.sheet.name,
      spreadsheetCellUsesTextFormat(targetWorksheet, targetReference),
    ));
    if (accepted !== false) finish();
  }

  function cancel() {
    if (targetWorksheet === undefined) return;
    draft = spreadsheetFormulaBarText(targetWorksheet.cell(targetReference));
    finish();
  }

  function finish() {
    authoring = false;
    oneditingchange?.(false);
    insertedReferenceSpan = undefined;
    input?.blur();
  }

  function beginAuthoring(event: FocusEvent) {
    authoring = true;
    oneditingchange?.(true);
    lastReferencePickId = referencePick?.id;
    rememberSelection(event.currentTarget as HTMLInputElement);
  }

  function updateDraft(event: Event) {
    insertedReferenceSpan = undefined;
    rememberSelection(event.currentTarget as HTMLInputElement);
  }

  function rememberSelection(element: HTMLInputElement) {
    selectionStart = element.selectionStart ?? draft.length;
    selectionEnd = element.selectionEnd ?? selectionStart;
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
  <output class="cell-reference" aria-label="Formula target">{targetLabel}</output>
  {#if onfunctions === undefined}
    <span class="formula-mark" aria-hidden="true">fx</span>
  {:else}
    <button
      type="button"
      class="formula-mark"
      aria-label="Insert function"
      aria-haspopup="dialog"
      aria-expanded={functionsOpen}
      disabled={!functionInsertable}
      onclick={(event) => onfunctions(event.currentTarget)}
    >fx</button>
  {/if}
  <input
    bind:this={input}
    bind:value={draft}
    aria-label={`Value or formula for ${reference}`}
    autocomplete="off"
    spellcheck="false"
    disabled={readonly || onedit === undefined}
    onfocus={beginAuthoring}
    oninput={updateDraft}
    onselect={(event) => rememberSelection(event.currentTarget)}
    onclick={(event) => rememberSelection(event.currentTarget)}
    onkeyup={(event) => rememberSelection(event.currentTarget)}
    onkeydown={handleKeydown}
  />
</form>

<style>
  .formula-bar { display: grid; grid-template-columns: minmax(64px, auto) 32px minmax(0, 1fr); min-width: 0; height: 32px; box-sizing: border-box; color: var(--tumbler-grid-fg, #d8e2d8); background: var(--tumbler-grid-bg, #111411); border-bottom: 1px solid var(--tumbler-grid-line, #2a302a); font: 13px/1.3 system-ui, sans-serif; }
  .cell-reference, .formula-mark { display: grid; min-width: 0; place-items: center; box-sizing: border-box; border-right: 1px solid var(--tumbler-grid-line, #2a302a); }
  .cell-reference { justify-content: start; padding: 0 10px; color: var(--tumbler-grid-fg, #d8e2d8); }
  .formula-mark { color: var(--tumbler-grid-muted, #9aa79a); font-style: italic; }
  button.formula-mark { padding: 0; border: 0; border-right: 1px solid var(--tumbler-grid-line, #2a302a); background: transparent; font: italic 13px/1.3 system-ui, sans-serif; cursor: pointer; }
  button.formula-mark:hover:not(:disabled), button.formula-mark[aria-expanded="true"] { color: var(--tumbler-grid-fg, #d8e2d8); }
  button.formula-mark:focus-visible { outline: 0; box-shadow: inset 0 0 0 2px var(--tumbler-grid-accent, #42ff53); }
  button.formula-mark:disabled { cursor: default; opacity: 0.5; }
  input { min-width: 0; border: 0; outline: 0; padding: 0 10px; color: var(--tumbler-grid-fg, #d8e2d8); background: transparent; font: inherit; user-select: text; -webkit-user-select: text; }
  input:focus { box-shadow: inset 0 -2px var(--tumbler-grid-accent, #42ff53); }
  input:disabled { opacity: 0.65; }
</style>
