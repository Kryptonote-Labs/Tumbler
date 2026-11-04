<script lang="ts">
  import { onMount } from 'svelte';
  import type { PdfTextContent } from '@tumblerjs/pdf';
  import { registerPdfTextLayer } from './pointer-selection.ts';
  import { selectPdfWord } from './selection.ts';
  import { pdfTextRuns } from './text-runs.ts';
  let {
    content,
    scale = 1,
    label = 'PDF text',
  }: {
    content: PdfTextContent;
    scale?: number;
    label?: string;
  } = $props();
  let layer: HTMLDivElement;
  let svg: SVGSVGElement;
  // Transparent selection glyphs need no paint until the page contains a native selection.
  onMount(() => {
    const changed = () => {
      const selection = window.getSelection();
      svg.style.opacity =
        selection &&
        !selection.isCollapsed &&
        selection.rangeCount &&
        selection.getRangeAt(0).intersectsNode(layer)
          ? '1'
          : '0';
    };
    changed();
    document.addEventListener('selectionchange', changed);
    return () => document.removeEventListener('selectionchange', changed);
  });
  $effect(() => registerPdfTextLayer(layer, content));
  const runs = $derived(pdfTextRuns(content));
</script>

<div
  bind:this={layer}
  class="text-layer"
  data-pdf-text-layer
  ondblclick={(event) => selectPdfWord(event, content, event.currentTarget)}
  role="document"
  aria-label={label}
  style:width={`${content.width}px`}
  style:height={`${content.height}px`}
  style:transform={`scale(${scale})`}
>
  <svg bind:this={svg} width="100%" height="100%" role="presentation">
    {#each runs as run (run.id)}
      <text
        transform={run.transform}
        font-size={run.size}
        font-family={run.font.family}
        font-weight={run.font.weight}
        font-style={run.font.style}
      >
        {#each run.items as { item, x, y, size } (item.id)}
          <tspan
            data-pdf-text-id={item.id}
            data-pdf-text={item.kind}
            data-pdf-glyph={item.kind === 'glyph' ? item.id : undefined}
            {x}
            {y}
            textLength={Math.max(0.00001, item.width * size)}
            lengthAdjust="spacingAndGlyphs">{item.text}</tspan
          >
        {/each}
      </text>
    {/each}
  </svg>
</div>

<style>
  .text-layer {
    contain: strict;
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    overflow: clip;
    user-select: text;
    -webkit-user-select: text;
    color: transparent;
    cursor: text;
  }
  svg {
    will-change: opacity;
    opacity: 0;
    display: block;
    overflow: visible;
    pointer-events: none;
  }
  text {
    white-space: pre;
    fill: none;
    unicode-bidi: isolate;
  }
  tspan::selection {
    background: rgb(64 128 255 / 0.35);
    fill: transparent;
  }
</style>
