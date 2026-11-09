<script lang="ts">
  import { tick } from "svelte";
  import type { PdfSearchIndex } from "@tumblerjs/pdf";
  let {
    root,
    scale,
    index,
  }: {
    root: HTMLDivElement | undefined;
    scale: number;
    index: () => PdfSearchIndex;
  } = $props();
  let open = $state(false),
    query = $state(""),
    matchCase = $state(false),
    active = $state(0);
  let input = $state<HTMLInputElement>();
  let error = $state("");
  const result = $derived.by(() => {
    if (!open || !query.trim()) return { matches: [], total: 0 };
    try {
      return index().find(query, { matchCase });
    } catch (cause) {
      return {
        matches: [],
        total: 0,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  });
  $effect(() => {
    error = "error" in result ? (result.error ?? "") : "";
  });
  $effect(() => {
    void query;
    void matchCase;
    active = 0;
  });
  $effect(() => {
    if (active >= result.total) active = Math.max(0, result.total - 1);
  });
  function move(direction: number) {
    if (result.total)
      active = (active + direction + result.total) % result.total;
  }
  async function key(event: KeyboardEvent) {
    if (!root?.getClientRects().length || root.closest("[hidden],[inert]"))
      return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      open = true;
      await tick();
      input?.focus({ preventScroll: true });
      input?.select();
    } else if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      open = false;
    }
  }
  $effect(() => {
    if (!root || !open) return;
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
          background: i === active ? "#ff8a0080" : "#ffe60066",
          outline: i === active ? "1px solid #b85d00" : "none",
        });
        page.append(mark);
        marks.push(mark);
      }
    }
    const current = marks.find(
      (mark) => mark.dataset.pdfSearchMatch === String(active),
    );
    current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    return () => marks.forEach((mark) => mark.remove());
  });
</script>

<svelte:window onkeydown={key} />
{#if open}
  <div class="pdf-search" role="search" aria-label="Find in PDF">
    <input
      bind:this={input}
      bind:value={query}
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
      >{error || `${result.total ? active + 1 : 0} of ${result.total}`}</span
    >
    <button
      aria-label="Match case"
      aria-pressed={matchCase}
      onclick={() => (matchCase = !matchCase)}>Aa</button
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
    <button aria-label="Close search" onclick={() => (open = false)}>×</button>
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
