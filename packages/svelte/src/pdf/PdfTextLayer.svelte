<script lang="ts">
  import { onMount } from 'svelte';
  import type { PdfTextContent } from '@tumblerjs/pdf';
  import { registerPdfTextLayer } from './pointer-selection.ts';
  import { selectPdfWord } from './selection.ts';
  import { pdfTextSpans } from './text-spans.ts';
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
    let showing = false;
    const changed = () => {
      const selection = window.getSelection();
      const next = !!(selection &&
        !selection.isCollapsed &&
        selection.rangeCount &&
        selection.getRangeAt(0).intersectsNode(layer));
      if (next !== showing) {
        showing = next;
        svg.style.opacity = next ? '1' : '0';
      }
    };
    document.addEventListener('selectionchange', changed);
    return () => document.removeEventListener('selectionchange', changed);
  });
  $effect(() => registerPdfTextLayer(layer, content, bindings));
  const runs = $derived(pdfTextRuns(content).map((run) => ({ ...run, spans: pdfTextSpans(run) })));
  const bindings = $derived(new Map(runs.flatMap((run) => run.spans.map((span) => [span.id, span.bindings] as const))));
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
        {#each run.spans as span (span.id)}
          <tspan
            data-pdf-text-id={span.id}
            data-pdf-text="run"
            data-pdf-glyph={span.glyph}
            x={span.x}
            y={span.y}
            textLength={span.width}
            lengthAdjust="spacingAndGlyphs">{span.text}</tspan>
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
    opacity: 0;
    display: block;
    overflow: visible;
    pointer-events: none;
  }
  text {
    white-space: pre;
    font-variant-ligatures: none;
    fill: none;
    unicode-bidi: isolate;
  }
  tspan::selection {
    background: rgb(64 128 255 / 0.35);
    fill: transparent;
  }
</style>
