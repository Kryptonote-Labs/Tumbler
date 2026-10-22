<script lang="ts">
  import { paintWordPage, wordPageImages, wordPageInkBounds, wordPointsToCssPixels, type WordImageDrawing, type WordLayoutPage } from '@tumblerjs/word';

  let { page, scale = 1, background = '#fff', imageurl, onerror }: {
    page: WordLayoutPage;
    scale?: number;
    background?: string;
    imageurl?: (drawing: WordImageDrawing) => string | undefined;
    onerror?: (message: string) => void;
  } = $props();
  let canvas = $state<HTMLCanvasElement>();
  const regions = $derived(wordPageInkBounds(page));

  // The final page pixels include text and later drawings over the ink. Only the
  // affected regions cover the DOM; its text, selection and controls stay interactive.
  $effect(() => {
    const current = page, boxes = regions, paper = background, source = imageurl;
    const resolution = 4 / 3 * scale * (window.devicePixelRatio || 1);
    if (!boxes.length || !canvas) return;
    const target = canvas;
    let cancelled = false;
    const urls: string[] = [];
    const decode = async (drawing: WordImageDrawing) => {
      if (drawing.inkProjection) return undefined;
      let url = source?.(drawing);
      if (!url) {
        url = URL.createObjectURL(new Blob([new Uint8Array(drawing.bytes)], { type: drawing.contentType }));
        urls.push(url);
      }
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = url;
      await image.decode();
      return image;
    };
    void (async () => {
      try {
        const drawings = wordPageImages(current);
        const images = new Map(await Promise.all(drawings.map(async drawing => [drawing, await decode(drawing)] as const)));
        if (cancelled) return;
        const buffer = document.createElement('canvas');
        buffer.width = Math.ceil(current.width * resolution);
        buffer.height = Math.ceil(current.height * resolution);
        const context = buffer.getContext('2d');
        if (!context) throw new Error('The document canvas is unavailable.');
        paintWordPage(context, current, { scale: resolution, inkMaxPixels: Infinity, background: paper, image: drawing => images.get(drawing), path: d => new Path2D(d) });
        // Compare with the same page without these strokes. Unchanged pixels
        // remain transparent, so DOM selection is not hidden by a rectangular patch.
        const backdrop = document.createElement('canvas');
        backdrop.width = buffer.width; backdrop.height = buffer.height;
        const underneath = backdrop.getContext('2d');
        if (!underneath) throw new Error('The ink canvas is unavailable.');
        paintWordPage(underneath, current, { scale: resolution, inkMaxPixels: Infinity, background: paper, omitDestinationInk: true, image: drawing => images.get(drawing), path: d => new Path2D(d) });
        const pixels = context.getImageData(0, 0, buffer.width, buffer.height);
        const original = underneath.getImageData(0, 0, buffer.width, buffer.height).data;
        for (let index = 0; index < pixels.data.length; index += 4) {
          if (pixels.data[index] === original[index] && pixels.data[index + 1] === original[index + 1] && pixels.data[index + 2] === original[index + 2] && pixels.data[index + 3] === original[index + 3]) pixels.data[index + 3] = 0;
        }
        context.putImageData(pixels, 0, 0);
        if (cancelled) return;
        target.width = buffer.width; target.height = buffer.height;
        target.getContext('2d')?.drawImage(buffer, 0, 0);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Ink could not be rendered.';
          if (onerror) onerror(message); else console.error(message);
        }
      } finally {
        urls.forEach(url => URL.revokeObjectURL(url));
      }
    })();
    return () => { cancelled = true; };
  });
</script>

{#if regions.length}
  <canvas bind:this={canvas} aria-hidden="true" contenteditable="false" data-word-ink-page style={`width:${wordPointsToCssPixels(page.width)}px;height:${wordPointsToCssPixels(page.height)}px`}></canvas>
{/if}

<style>
  :global([data-word-ink-page-host] img[data-word-ink-rendering="raster"]) { visibility: hidden; }
  canvas { position: absolute; inset: 0; z-index: var(--word-ink-layer-z-index, 3); pointer-events: none; }
</style>
