<script lang="ts">
  import { tick } from "svelte";
  import type { PdfSearchIndex, PdfTextModel } from "@tumblerjs/pdf";
  import { createPdfSearch, type PdfSearchController } from "./search.svelte.ts";
  let {
    root,
    scale,
    index,
    controller,
    enabled = true,
    model,
  }: {
    root: HTMLDivElement | undefined;
    scale: number;
    index: () => PdfSearchIndex;
    controller?: PdfSearchController;
    enabled?: boolean;
    model?: () => PdfTextModel | undefined;
  } = $props();
  const fallback = createPdfSearch();
  const search = $derived(controller ?? fallback);
  let input = $state<HTMLInputElement>();
  let replacement = $state("");
  $effect(() => { if (enabled) return search.connect({ index, model }); });
  const result = $derived({ matches: search.matches, total: search.total });
  function move(direction: number) { search.move(direction); }
  async function key(event: KeyboardEvent) {
    if (!enabled || !root?.getClientRects().length || root.closest("[hidden],[inert]"))
      return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      if (controller) return;
      search.open = true;
      await tick();
      input?.focus({ preventScroll: true });
      input?.select();
    } else if (search.open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      search.open = false;
    }
  }
  $effect(() => {
    if (!enabled || !root || !search.open) return;
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
          background: i === search.active ? "#ff8a0080" : "#ffe60066",
          outline: i === search.active ? "1px solid #b85d00" : "none",
        });
        page.append(mark);
        marks.push(mark);
      }
    }
    const current = marks.find(
      (mark) => mark.dataset.pdfSearchMatch === String(search.active),
    );
    current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    return () => marks.forEach((mark) => mark.remove());
  });
</script>

<svelte:window onkeydown={key} />
{#if search.open && !controller}
  <div class="pdf-search" role="search" aria-label="Find in PDF">
    <input
      bind:this={input}
      bind:value={search.query}
      aria-label="Search document"
      placeholder="Search document…"
      onkeydown={(event) => {
        if (event.key === "Enter" && !event.isComposing) {
          event.preventDefault();
          move(event.shiftKey ? -1 : 1);
        }
      }}
    />
    <span role="status"
      >{search.error || `${result.total ? search.active + 1 : 0} of ${result.total}`}</span
    >
    <button
      aria-label="Match case"
      aria-pressed={search.matchCase}
      onclick={() => (search.matchCase = !search.matchCase)}>Aa</button
    >
    <button
      aria-label="Previous match"
      disabled={!result.total}
      onclick={() => move(-1)}>↑</button
    >
    <button
      aria-label="Next match"
      disabled={!result.total}
      onclick={() => move(1)}>↓</button
    >
    {#if model?.()}
      <input aria-label="Replace with" placeholder="Replace with" bind:value={replacement} />
      <button disabled={!search.canReplace} onclick={() => search.replace(replacement)}>Replace</button>
      <button disabled={!search.total} onclick={() => search.replace(replacement, true)}>Replace all</button>
    {/if}
    <button aria-label="Close search" onclick={() => (search.open = false)}>×</button>
  </div>
{/if}

<style>
  .pdf-search {
    position: fixed;
    top: var(--tumbler-pdf-search-top, 8px);
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
