<script lang="ts">
  import { onMount } from 'svelte';
  import { PdfPageRenderer } from './page-renderer.ts';
  import { paintPdfTiles } from './paint-tiles.ts';
  import PdfTextLayer from './PdfTextLayer.svelte';
  import { PdfError, type PdfInterpreter, type PdfTextContent } from '@tumblerjs/pdf';
  let {
    interpreter,
    index,
    scale,
    renderer,
    onerror,
    onvisible,
  }: {
    interpreter: PdfInterpreter;
    renderer?: PdfPageRenderer;
    index: number;
    scale: number;
    onerror?: (error: Error, page: number) => void;
    onvisible?: (page: number) => void;
  } = $props();
  const page = $derived(interpreter.document.pages[index]!);
  let host: HTMLDivElement;
  let ownRenderer = $state.raw<PdfPageRenderer>();
  $effect(() => {
    if (renderer) return;
    const current = new PdfPageRenderer(interpreter.document, interpreter.executionLimits);
    ownRenderer = current;
    return () => current.destroy();
  });
  const painter = $derived(renderer ?? ownRenderer);
  let visible = $state(false);
  let error = $state('');
  let text = $state.raw<PdfTextContent>();
  let selected = $state(false);
  onMount(() => {
    let near = false;
    const applyVisibility = () => {
      visible = near;
      if (!visible) selectionChanged();
    };
    const finishedZoom = (event: Event) => {
      if (event.target instanceof Node && event.target.contains(host)) applyVisibility();
    };
    document.addEventListener('pdfzoomend', finishedZoom, true);
    let root = host.parentElement;
    while (root && !/(auto|scroll)/.test(getComputedStyle(root).overflowY))
      root = root.parentElement;
    const observer = new IntersectionObserver(
      (entries) => {
        near = entries.some((entry) => entry.isIntersecting);
        if (!host.closest('[data-pdf-zooming]')) applyVisibility();
      },
      { root, rootMargin: '128px' },
    );
    let position: IntersectionObserver;
    const trackPosition = () => {
      position?.disconnect();
      const margin = Math.floor((root?.clientHeight ?? window.innerHeight) * 0.45);
      position = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) onvisible?.(index);
        },
        { root, rootMargin: `-${margin}px 0px -${margin}px 0px` },
      );
      position.observe(host);
    };
    const resize = new ResizeObserver(trackPosition);
    resize.observe(root ?? document.documentElement);
    trackPosition();
    observer.observe(host);
    const selectionChanged = () => {
      const selection = window.getSelection();
      selected =
        !!text &&
        !!selection &&
        !selection.isCollapsed &&
        !!selection.rangeCount &&
        selection.getRangeAt(0).intersectsNode(host);
    };
    document.addEventListener('selectionchange', selectionChanged);
    return () => {
      observer.disconnect();
      position.disconnect();
      resize.disconnect();
      document.removeEventListener('selectionchange', selectionChanged);
      document.removeEventListener('pdfzoomend', finishedZoom, true);
    };
  });
  $effect(() => {
    if (!visible && !selected) text = undefined;
  });
  function failed(cause: Error) {
    error =
      cause instanceof PdfError && cause.code === 'unsupported_feature'
        ? "This page uses a PDF feature we haven't added yet."
        : 'Could not render this page.';
    onerror?.(cause, index);
  }
</script>

<div
  bind:this={host}
  class="pdf-page"
  data-pdf-page={index + 1}
  style:width={`${page.width * scale}px`}
  style:height={`${page.height * scale}px`}
>
  {#if painter}<div
      class="raster"
      role="img"
      aria-label={`Page ${index + 1}`}
      aria-hidden={!!text?.items.length}
      use:paintPdfTiles={{
        renderer: painter,
        index,
        scale,
        width: page.width,
        height: page.height,
        ontext: (content) => {
          if (!text) text = content;
          error = '';
        },
        onerror: failed,
        onpaint: () => {
          error = '';
        },
      }}
    ></div>{/if}
  {#if text?.items.length}<PdfTextLayer
      content={text}
      {scale}
      label={`Page ${index + 1} text`}
    />{/if}
  {#if error}<div class="page-error" role="alert">{error}</div>{/if}
</div>

<style>
  .pdf-page {
    position: relative;
    flex: none;
    background: white;
    box-shadow: 0 1px 5px #0005;
    color-scheme: light;
  }
  .raster {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .page-error {
    position: absolute;
    z-index: 1;
    inset: 0;
    display: grid;
    place-content: center;
    padding: 24px;
    color: #9b1c1c;
    font: 14px/1.5 sans-serif;
    background: white;
  }
</style>
