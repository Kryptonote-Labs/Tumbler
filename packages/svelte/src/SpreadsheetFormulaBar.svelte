<script lang="ts">
  import { tick } from "svelte";
  import type { SpreadsheetWorksheet } from "@tumblerjs/sheets";
  import { spreadsheetFormulaBarEdit, spreadsheetFormulaBarText, type SpreadsheetFormulaBarEdit } from "./spreadsheet-formula-bar.ts";
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
    readonly readonly?: boolean;
  }

  let { worksheet, reference, referencePick, onedit, readonly = false }: Props = $props();
  let draft = $state("");
  let input = $state<HTMLInputElement>();
  let authoring = $state(false);
  let targetWorksheet = $state<SpreadsheetWorksheet>();
  let targetReference = $state("");
  let selectionStart = $state(0);
  let selectionEnd = $state(0);
  let lastReferencePickId = $state<number>();
  let insertedReferenceSpan = $state<SpreadsheetFormulaTextSpan>();

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
    if (!authoring || !draft.startsWith("=") || pick === undefined || pick.id === lastReferencePickId || targetWorksheet === undefined) return;
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

  function commit() {
    if (readonly || onedit === undefined || targetWorksheet === undefined) return;
    const accepted = onedit(spreadsheetFormulaBarEdit(
      targetReference,
      draft,
      targetWorksheet.cell(targetReference),
      targetWorksheet.sheet.name,
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
    insertedReferenceSpan = undefined;
    input?.blur();
  }

  function beginAuthoring(event: FocusEvent) {
    authoring = true;
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
  <output class="cell-reference" aria-label="Formula target">{targetReference || reference}</output>
  <span class="formula-mark" aria-hidden="true">fx</span>
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
  input { min-width: 0; border: 0; outline: 0; padding: 0 10px; color: var(--tumbler-grid-fg, #d8e2d8); background: transparent; font: inherit; user-select: text; -webkit-user-select: text; }
  input:focus { box-shadow: inset 0 -2px var(--tumbler-grid-accent, #42ff53); }
  input:disabled { opacity: 0.65; }
</style>
