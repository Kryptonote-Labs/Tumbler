<script lang="ts">
  import { onMount } from 'svelte';
  import type { PdfDocument } from '@tumblerjs/pdf';
  import { thumbnailRenderer } from './thumbnail-renderer.ts';
  let { document: pdf, index, pixels = 180 }: { document: PdfDocument; index: number; pixels?: number } = $props();
  let canvas = $state<HTMLCanvasElement>();
  let visible = $state(false), error = $state(false);
  const page = $derived(pdf.pages[index]!);
  onMount(() => {
    const observer = new IntersectionObserver(entries => visible = entries.some(entry => entry.isIntersecting), { rootMargin: '100px' });
    if (canvas) observer.observe(canvas);
    return () => observer.disconnect();
  });
  $effect(() => {
    const target = canvas;
    if (!target || !visible) { if (target) target.width = target.height = 0; return; }
    const controller = new AbortController(), pool = thumbnailRenderer(pdf);
    const scale = pixels / Math.max(page.width, page.height);
    error = false;
    void pool.renderer.render({ page: index, scale, region: { x: 0, y: 0, width: Math.max(1, Math.ceil(page.width * scale)), height: Math.max(1, Math.ceil(page.height * scale)) } }, controller.signal).then(result => {
      try {
        if (controller.signal.aborted) return;
        target.width = result.bitmap.width;
        target.height = result.bitmap.height;
        target.getContext('2d')?.drawImage(result.bitmap, 0, 0);
      } finally { result.bitmap.close(); }
    }).catch(() => { if (!controller.signal.aborted) error = true; });
    return () => { controller.abort(); pool.release(); target.width = target.height = 0; };
  });
</script>
<div class="thumbnail" style:aspect-ratio={`${page.width} / ${page.height}`}>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
  {#if error}<span>Preview unavailable</span>{/if}
</div>
<style>
  .thumbnail { position: relative; width: 100%; background: white; box-shadow: 0 1px 4px #0004; color-scheme: light; }
  canvas { display: block; width: 100%; height: 100%; }
  span { position: absolute; inset: 0; display: grid; place-items: center; color: #555; font-size: 10px; padding: 4px; text-align: center; }
</style>
