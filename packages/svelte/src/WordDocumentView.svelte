<script lang="ts">
  import { onMount } from "svelte";
  import { layoutWordDocument, wordPointsToCssPixels, type WordDocument, type WordLayout } from "@tumblerjs/word";
  import { browserWordTextMeasurer, wordTextCss } from "./word-font-metrics.ts";
  import { calculateWordPageViewport, type WordPageViewport } from "./word-page-viewport.ts";

  interface Props {
    readonly wordDocument: WordDocument;
    readonly onhyperlink?: (target: string) => void;
    readonly scale?: number;
  }

  let { wordDocument, onhyperlink, scale = 1 }: Props = $props();
  let scroller = $state<HTMLDivElement>();
  let layout = $state<WordLayout>();
  let viewport = $state<WordPageViewport>();
  let mounted = $state(false);

  onMount(() => {
    mounted = true;
    void globalThis.document.fonts?.ready.then(reflow);
    reflow();
    const fonts = globalThis.document.fonts;
    fonts?.addEventListener("loadingdone", reflow);
    return () => fonts?.removeEventListener("loadingdone", reflow);
  });

  $effect(() => {
    wordDocument;
    scale;
    if (mounted) reflow();
  });

  function reflow() {
    const canvas = globalThis.document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) return;
    layout = layoutWordDocument(wordDocument, browserWordTextMeasurer(context));
    updateViewport();
  }

  function updateViewport() {
    if (layout === undefined || scroller === undefined) return;
    viewport = calculateWordPageViewport(layout, scroller.scrollTop / scale, scroller.clientHeight / scale);
  }

  function activateHyperlink(event: MouseEvent | KeyboardEvent, target: string | undefined) {
    if (target === undefined || onhyperlink === undefined) return;
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onhyperlink(target);
  }

  function fragmentStyle(fragment: NonNullable<WordLayout["pages"][number]["columns"][number]["lines"][number]["fragments"][number]>) {
    return `${wordTextCss(fragment.format)};left:${wordPointsToCssPixels(fragment.x)}px;top:${wordPointsToCssPixels(fragment.y)}px;width:${wordPointsToCssPixels(fragment.width)}px;height:${wordPointsToCssPixels(fragment.height)}px;line-height:${wordPointsToCssPixels(fragment.height)}px`;
  }
</script>

<div
  class="word-scroller"
  bind:this={scroller}
  aria-label="Document pages"
  onscroll={updateViewport}
  style={`--word-scale:${scale}`}
>
  {#if layout !== undefined && viewport !== undefined}
    <div class="word-surface" style={`height:${viewport.totalHeight * scale}px`}>
      {#each layout.pages.slice(viewport.first, viewport.last + 1) as page, localIndex (page.index)}
        {@const pageIndex = viewport.first + localIndex}
        <section
          class="word-page"
          aria-label={`Page ${page.index + 1}`}
          style={`left:50%;top:${viewport.offsets[pageIndex]! * scale}px;width:${wordPointsToCssPixels(page.width) * scale}px;height:${wordPointsToCssPixels(page.height) * scale}px`}
        >
          <div class="word-page-content" style={`width:${wordPointsToCssPixels(page.width)}px;height:${wordPointsToCssPixels(page.height)}px;transform:scale(${scale});transform-origin:top left`}>
            {#each page.columns as column}
              {#each column.lines as line}
                {#if line.marker !== undefined}
                  <span
                    class="list-marker"
                    aria-hidden="true"
                    style={`${wordTextCss(line.marker.format)};left:${wordPointsToCssPixels(line.marker.x)}px;top:${wordPointsToCssPixels(line.marker.y)}px;width:${wordPointsToCssPixels(line.marker.width)}px;height:${wordPointsToCssPixels(line.marker.height)}px;line-height:${wordPointsToCssPixels(line.marker.height)}px`}
                  >{line.marker.text}</span>
                {/if}
                {#each line.fragments as fragment}
                  {#if fragment.hyperlink === undefined}
                    <span
                      data-paragraph={line.paragraphElementId}
                      data-start={fragment.startOffset}
                      data-end={fragment.endOffset}
                      style={fragmentStyle(fragment)}
                    >{fragment.text}</span>
                  {:else}
                    <button
                      class="hyperlink"
                      onkeydown={(event) => activateHyperlink(event, fragment.hyperlink)}
                      onclick={(event) => activateHyperlink(event, fragment.hyperlink)}
                      data-paragraph={line.paragraphElementId}
                      data-start={fragment.startOffset}
                      data-end={fragment.endOffset}
                      style={fragmentStyle(fragment)}
                    >{fragment.text}</button>
                  {/if}
                {/each}
              {/each}
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .word-scroller { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; background: var(--tumbler-document-workspace, #e7e8ea); color: #000; }
  .word-surface { position: relative; min-width: 100%; }
  .word-page { position: absolute; transform: translateX(-50%); overflow: hidden; box-sizing: border-box; background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 0.2); contain: strict; }
  .word-page-content { position: absolute; inset: 0 auto auto 0; overflow: hidden; }
  span, button { position: absolute; display: block; box-sizing: border-box; white-space: pre; user-select: text; -webkit-user-select: text; }
  button { margin: 0; border: 0; padding: 0; text-align: inherit; }
  .hyperlink { cursor: pointer; text-decoration: underline; text-decoration-color: currentColor; }
  .hyperlink:focus-visible { outline: 2px solid var(--tumbler-document-accent, #42ff53); outline-offset: 1px; }
</style>
