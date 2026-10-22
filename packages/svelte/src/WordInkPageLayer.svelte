<script lang="ts">
  import { paintWordPage, wordPageImages, wordPageInkBounds, type WordImageDrawing, type WordLayoutPage } from '@tumblerjs/word';
  import { reserveWordInkPixels, wordInkTiles, WORD_INK_PAGE_PIXELS, WORD_INK_TILE_PIXELS } from './word-ink-tiles.ts';

  let { page, scale = 1, background = '#fff', maxPixels = WORD_INK_PAGE_PIXELS, imageurl, onerror }: {
    page: WordLayoutPage;
    scale?: number;
    background?: string;
    /** Retained pixels per page, at most 1,048,576. Resolution falls to fit. */
    maxPixels?: number;
    imageurl?: (drawing: WordImageDrawing) => string | undefined;
    onerror?: (message: string) => void;
  } = $props();
  let host = $state<HTMLDivElement>();
  const regions = $derived(wordPageInkBounds(page));

  $effect(() => {
    const current = page, boxes = regions, paper = background, source = imageurl, budget = maxPixels;
    const resolution = 4 / 3 * scale * (window.devicePixelRatio || 1);
    if (!boxes.length || !host) return;
    const target = host;
    let cancelled = false;
    let release: (() => void) | undefined;
    const urls: string[] = [], canvases: HTMLCanvasElement[] = [];
    const report = (error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : 'Ink could not be rendered.';
      if (onerror) onerror(message); else console.error(message);
    };
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
    const clear = () => {
      target.removeAttribute('data-word-ink-ready');
      target.replaceChildren();
      for (const canvas of canvases) { canvas.width = 0; canvas.height = 0; }
      release?.(); release = undefined;
    };
    void (async () => {
      try {
        let plan = wordInkTiles(current, resolution, budget);
        release = reserveWordInkPixels(plan.pixels + 2 * WORD_INK_TILE_PIXELS);
        for (let smaller = Math.floor(budget / 2); !release && smaller >= 1; smaller = Math.floor(smaller / 2)) {
          plan = wordInkTiles(current, resolution, smaller);
          release = reserveWordInkPixels(plan.pixels + 2 * WORD_INK_TILE_PIXELS);
        }
        if (!release) throw new Error('Mounted ink overlays exceed the aggregate pixel budget.');
        // Keep decode failures separate; only an image used by a tile can abort it.
        const images = new Map<WordImageDrawing, HTMLImageElement | undefined>();
        const failures = new Map<WordImageDrawing, unknown>();
        for (const drawing of wordPageImages(current, plan.tiles.map(tile => ({ x: tile.x / plan.scale, y: tile.y / plan.scale, width: tile.width / plan.scale, height: tile.height / plan.scale })))) {
          if (cancelled) return;
          try { images.set(drawing, await decode(drawing)); }
          catch (error) { failures.set(drawing, error); }
        }
        const buffer = document.createElement('canvas'), backdrop = document.createElement('canvas');
        canvases.push(buffer, backdrop);
        for (const tile of plan.tiles) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          if (cancelled) return;
          buffer.width = backdrop.width = tile.width;
          buffer.height = backdrop.height = tile.height;
          const context = buffer.getContext('2d'), underneath = backdrop.getContext('2d');
          if (!context || !underneath) throw new Error('The ink canvas is unavailable.');
          const options = {
            scale: plan.scale, viewport: tile, inkMaxPixels: WORD_INK_TILE_PIXELS, background: paper,
            onInkFallback: () => { throw new Error('Native ink could not be composed within the tile budget.'); },
            image: (drawing: WordImageDrawing) => {
              if (failures.has(drawing)) throw failures.get(drawing);
              return images.get(drawing);
            }, path: (d: string) => new Path2D(d),
          };
          paintWordPage(context, current, options);
          paintWordPage(underneath, current, { ...options, omitDestinationInk: true });
          const pixels = context.getImageData(0, 0, tile.width, tile.height);
          const original = underneath.getImageData(0, 0, tile.width, tile.height).data;
          for (let index = 0; index < pixels.data.length; index += 4) {
            if (pixels.data[index] === original[index] && pixels.data[index + 1] === original[index + 1] && pixels.data[index + 2] === original[index + 2] && pixels.data[index + 3] === original[index + 3]) pixels.data[index + 3] = 0;
          }
          const canvas = document.createElement('canvas');
          canvases.push(canvas);
          canvas.width = tile.width; canvas.height = tile.height;
          const output = canvas.getContext('2d');
          if (!output) throw new Error('The ink canvas is unavailable.');
          output.putImageData(pixels, 0, 0);
          const css = 4 / 3 / plan.scale;
          canvas.style.cssText = `position:absolute;left:${tile.x * css}px;top:${tile.y * css}px;width:${tile.width * css}px;height:${tile.height * css}px`;
          target.append(canvas);
        }
        buffer.width = backdrop.width = 0;
        buffer.height = backdrop.height = 0;
        if (!cancelled) target.setAttribute('data-word-ink-ready', '');
      } catch (error) { clear(); report(error); }
      finally { urls.forEach(url => URL.revokeObjectURL(url)); }
    })();
    return () => { cancelled = true; clear(); urls.forEach(url => URL.revokeObjectURL(url)); };
  });
</script>

{#if regions.length}
  <div bind:this={host} aria-hidden="true" contenteditable="false" data-word-ink-page></div>
{/if}

<style>
  :global([data-word-ink-page-host]:has([data-word-ink-ready]) img[data-word-ink-rendering="raster"]) { visibility: hidden; }
  div { position: absolute; inset: 0; z-index: var(--word-ink-layer-z-index, 3); pointer-events: none; visibility: hidden; }
  div:global([data-word-ink-ready]) { visibility: visible; }

</style>
