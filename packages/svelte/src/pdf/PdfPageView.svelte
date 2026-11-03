<script lang="ts">
  import { onMount } from 'svelte';
  import { browserPdfPaintHost, paintPdfPage, type PdfInterpreter } from '@tumblerjs/pdf';
  let { interpreter, index, scale, onerror, onvisible }: {
    interpreter: PdfInterpreter;
    index: number;
    scale: number;
    onerror?: (error: Error, page: number) => void;
    onvisible?: (page: number) => void;
  } = $props();
  const page = $derived(interpreter.document.pages[index]!);
  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let visible = $state(false);
  let error = $state('');
  onMount(() => {
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
    }, { rootMargin: '600px 0px' });
    let root = host.parentElement;
    while (root && !/(auto|scroll)/.test(getComputedStyle(root).overflowY)) root = root.parentElement;
    let position: IntersectionObserver;
    const trackPosition = () => {
      position?.disconnect();
      const margin = Math.floor((root?.clientHeight ?? window.innerHeight) * 0.45);
      position = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) onvisible?.(index);
      }, { root, rootMargin: `-${margin}px 0px -${margin}px 0px` });
      position.observe(host);
    };
    const resize = new ResizeObserver(trackPosition);
    resize.observe(root ?? document.documentElement);
    trackPosition();
    observer.observe(host);
    return () => { observer.disconnect(); position.disconnect(); resize.disconnect(); };
  });
  $effect(() => {
    if (!visible) { canvas.width = 0; canvas.height = 0; interpreter.releasePage(index); return; }
    const current = interpreter, pageIndex = index, displayScale = scale;
    const controller = new AbortController();
    const host = browserPdfPaintHost();
    const render = async () => {
      // Yield before interpreting so navigation can paint first.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      controller.signal.throwIfAborted();
      const scene = current.page(pageIndex), ratio = window.devicePixelRatio || 1;
      const staging = document.createElement('canvas');
      staging.width = Math.ceil(scene.width * displayScale * ratio);
      staging.height = Math.ceil(scene.height * displayScale * ratio);
      const context = staging.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable.');
      await paintPdfPage(context, scene, current.document.source, host, { scale: displayScale * ratio, signal: controller.signal });
      controller.signal.throwIfAborted();
      canvas.width = staging.width; canvas.height = staging.height;
      canvas.getContext('2d')?.drawImage(staging, 0, 0);
      error = '';
    };
    void render().catch(cause => {
      if (controller.signal.aborted) return;
      error = cause instanceof Error ? cause.message : 'Could not render this page.';
      onerror?.(cause instanceof Error ? cause : new Error(error), pageIndex);
    }).finally(() => host.close());
    return () => controller.abort();
  });
</script>

<div bind:this={host} class="pdf-page" data-pdf-page={index + 1} style:width={`${page.width * scale}px`} style:height={`${page.height * scale}px`}>
  <canvas bind:this={canvas} aria-label={`Page ${index + 1}`}></canvas>
  {#if error}<div class="page-error" role="alert">{error}</div>{/if}
</div>

<style>
  .pdf-page { position: relative; flex: none; background: white; box-shadow: 0 1px 5px #0005; color-scheme: light; }
  canvas { display: block; width: 100%; height: 100%; }
  .page-error { position: absolute; inset: 0; display: grid; place-content: center; padding: 24px; color: #9b1c1c; font: 14px/1.5 sans-serif; background: white; }
</style>
