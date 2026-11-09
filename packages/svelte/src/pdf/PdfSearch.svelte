<script lang="ts">
  import { PdfSearchState } from "./search-state.svelte.ts";
  import { tick } from "svelte";
  import type { PdfSearchIndex } from "@tumblerjs/pdf";
  let {
    root,
    scale,
    index,
    search,
    enabled = true,
  }: {
    search?: PdfSearchState;
    enabled?: boolean;
    root: HTMLDivElement | undefined;
    scale: number;
    index: () => PdfSearchIndex;
  } = $props();
  const fallback = new PdfSearchState();
  const state = $derived(search ?? fallback);
  let replacement = $state("");
  let input = $state<HTMLInputElement>();
  const result = $derived(state.result);
  $effect(() => {
    if (!enabled) return;
    const source = () => index();
    state.source = source;
    return () => { if (state.source === source) state.source = undefined; };
  });
  $effect(() => { void state.query; void state.matchCase; void state.wholeWord; state.active = 0; });
  $effect(() => { if (state.active >= result.total) state.active = Math.max(0, result.total - 1); });
  async function key(event: KeyboardEvent) {
    if (search || !enabled) return;
    if (!root?.getClientRects().length || root.closest("[hidden],[inert]"))
      return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      state.open = true;
      await tick();
      input?.focus({ preventScroll: true });
      input?.select();
    } else if (state.open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      state.open = false;
    }
  }
  $effect(() => {
    if (!root || !enabled || !state.open) return;
    const marks: HTMLElement[] = [];
    for (const [i, match] of result.matches.entries()) {
      const page = root.querySelector<HTMLElement>(
        `[data-pdf-page="${match.page}"]`,
      );
      if (!page) continue;
      for (const rect of match.rects) {
        const mark = document.createElement("span");
        mark.dataset.pdfSearchMatch = String(i);
        mark.setAttribute("aria-hidden", "true");
        Object.assign(mark.style, {
          position: "absolute",
          pointerEvents: "none",
          zIndex: "4",
          left: `${rect.x * scale}px`,
          top: `${rect.y * scale}px`,
          width: `${rect.width * scale}px`,
          height: `${rect.height * scale}px`,
          background: i === state.active ? "#ff8a0080" : "#ffe60066",
          outline: i === state.active ? "1px solid #b85d00" : "none",
        });
        page.append(mark);
        marks.push(mark);
      }
    }
    const current = marks.find(
      (mark) => mark.dataset.pdfSearchMatch === String(state.active),
    );
    current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    return () => marks.forEach((mark) => mark.remove());
  });
</script>

<svelte:window onkeydown={key} />
{#if enabled && !search && state.open}
  <div class="pdf-search" role="search" aria-label="Find in PDF">
    <input
      bind:this={input}
      bind:value={state.query}
      aria-label="Search document"
      placeholder="Search document…"
      onkeydown={(event) => {
        if (event.key === "Enter" && !event.isComposing) {
          event.preventDefault();
          state.move(event.shiftKey ? -1 : 1);
        }
      }}
    />
    <span role="status"
      >{`${result.total ? state.active + 1 : 0} of ${result.total}`}</span
    >
    <button
      aria-label="Match case"
      aria-pressed={state.matchCase}
      onclick={() => (state.matchCase = !state.matchCase)}>Aa</button
    >
    <button
      aria-label="Previous match"
      disabled={!result.total}
      onclick={() => state.move(-1)}>↑</button
    >
    <button
      aria-label="Next match"
      disabled={!result.total}
      onclick={() => state.move(1)}>↓</button
    >
    {#if result.matches.some(match => match.range)}
      <input aria-label="Replace with" bind:value={replacement} />
      <button disabled={!state.activeMatch?.range} onclick={() => state.replace(replacement)}>Replace</button>
      <button onclick={() => state.replace(replacement, true)}>Replace all</button>
    {/if}
    <button aria-label="Close search" onclick={() => (state.open = false)}>×</button>
  </div>
{/if}

<style>
  .pdf-search {
    position: fixed;
    top: 72px;
    right: 24px;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 1px solid #8886;
    border-radius: 8px;
    background: var(--tumbler-surface, #fff);
    color: var(--tumbler-text, #222);
    box-shadow: 0 3px 12px #0003;
    font: 14px system-ui;
    max-width: calc(100vw - 32px);
  }
  input {
    width: 180px;
    min-width: 60px;
    padding: 6px;
    border: 1px solid #8886;
    border-radius: 4px;
    color: inherit;
    background: transparent;
  }
  button {
    border: 0;
    border-radius: 4px;
    padding: 5px 8px;
    cursor: pointer;
    background: transparent;
    color: inherit;
  }
  button[aria-pressed="true"] {
    background: #8884;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  span {
    white-space: nowrap;
  }
</style>
