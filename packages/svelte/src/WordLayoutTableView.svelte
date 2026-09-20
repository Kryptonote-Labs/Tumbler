<script lang="ts">
  import { wordPointsToCssPixels, type WordImageDrawing, type WordLayoutFragment, type WordLayoutTable } from "@tumblerjs/word";
  import OoxmlChart from "./OoxmlChart.svelte";
  import { wordTextCss } from "./word-font-metrics.ts";

  interface Props {
    readonly table: WordLayoutTable;
    readonly pageIndex: number;
    readonly imageurl: (drawing: WordImageDrawing) => string;
    readonly onactivate: (event: MouseEvent | KeyboardEvent, target: string | undefined) => void;
    readonly story?: string;
    readonly decorationsOnly?: boolean;
  }

  let { table, pageIndex, imageurl, onactivate, story, decorationsOnly = false }: Props = $props();

  function fragmentStyle(fragment: WordLayoutFragment) {
    return `${wordTextCss(fragment.format)};left:${wordPointsToCssPixels(fragment.x)}px;top:${wordPointsToCssPixels(fragment.y)}px;width:${wordPointsToCssPixels(fragment.width)}px;height:${wordPointsToCssPixels(fragment.height)}px;line-height:${wordPointsToCssPixels(fragment.height)}px`;
  }

  function drawingStyle(fragment: WordLayoutFragment) {
    return `left:${wordPointsToCssPixels(fragment.x)}px;top:${wordPointsToCssPixels(fragment.y)}px;width:${wordPointsToCssPixels(fragment.width)}px;height:${wordPointsToCssPixels(fragment.height)}px`;
  }
</script>

{#snippet renderTable(current: WordLayoutTable)}
  <div
    class="document-table"
    data-table={current.tableElementId}
    contenteditable="false"
    aria-hidden="true"
    data-story={story}
    style={`left:${wordPointsToCssPixels(current.x)}px;top:${wordPointsToCssPixels(current.y)}px;width:${wordPointsToCssPixels(current.width)}px;height:${wordPointsToCssPixels(current.height)}px`}
  >
    {#each current.cells as cell}
      <div
        class="document-cell"
        data-cell={cell.cellElementId}
        style={`left:${wordPointsToCssPixels(cell.x - current.x)}px;top:${wordPointsToCssPixels(cell.y - current.y)}px;width:${wordPointsToCssPixels(cell.width)}px;height:${wordPointsToCssPixels(cell.height)}px`}
      ></div>
    {/each}
  </div>
  {#each current.cells as cell}
    {#if !decorationsOnly}
      {#each cell.lines as line}
        {#if line.marker !== undefined}
          <span class="list-marker" aria-hidden="true" style={`${wordTextCss(line.marker.format)};left:${wordPointsToCssPixels(line.marker.x)}px;top:${wordPointsToCssPixels(line.marker.y)}px;width:${wordPointsToCssPixels(line.marker.width)}px;height:${wordPointsToCssPixels(line.marker.height)}px;line-height:${wordPointsToCssPixels(line.marker.height)}px`}>{line.marker.text}</span>
        {/if}
        {#if line.fragments.length === 0 || line.fragments.at(-1)?.endOffset !== line.endOffset}
          <span
            class="caret-anchor"
            class:empty-line={line.fragments.length === 0}
            data-story={story}
            data-paragraph={line.paragraphElementId}
            data-start={line.fragments.at(-1)?.endOffset ?? line.startOffset}
            data-end={line.endOffset}
            style={`left:${wordPointsToCssPixels(line.x + line.width)}px;top:${wordPointsToCssPixels(line.y)}px;width:1px;height:${wordPointsToCssPixels(line.height)}px;line-height:${wordPointsToCssPixels(line.height)}px`}
          >{"\u200b"}</span>
        {/if}
        {#each line.fragments as fragment}
          {#if fragment.kind === "drawing" && fragment.drawing?.kind === "image"}
            <img class="document-drawing" src={imageurl(fragment.drawing)} alt={fragment.drawing.altText ?? ""} style={drawingStyle(fragment)} />
          {:else if fragment.kind === "drawing" && fragment.drawing?.kind === "chart"}
            <div class="document-drawing" style={drawingStyle(fragment)}><OoxmlChart model={fragment.drawing.model} width={wordPointsToCssPixels(fragment.width)} height={wordPointsToCssPixels(fragment.height)} clipId={`word-table-chart-${pageIndex}-${fragment.contentElementId}`} /></div>
          {:else if fragment.kind === "drawing"}
            <div class="document-drawing drawing-fallback" role="img" aria-label={fragment.drawing?.altText ?? "Drawing preview unavailable"} style={drawingStyle(fragment)}></div>
          {:else if fragment.hyperlink === undefined}
            <span data-story={story} data-paragraph={line.paragraphElementId} data-start={fragment.startOffset} data-end={fragment.endOffset} style={fragmentStyle(fragment)}>{fragment.text}</span>
          {:else}
            <button class="hyperlink" onkeydown={(event) => onactivate(event, fragment.hyperlink)} onclick={(event) => onactivate(event, fragment.hyperlink)} data-story={story} data-paragraph={line.paragraphElementId} data-start={fragment.startOffset} data-end={fragment.endOffset} style={fragmentStyle(fragment)}>{fragment.text}</button>
          {/if}
        {/each}
      {/each}
    {/if}
    {#each cell.tables as nested}
      {@render renderTable(nested)}
    {/each}
  {/each}
{/snippet}

{@render renderTable(table)}

<style>
  .document-table, .document-cell, .document-drawing, span, button { position: absolute; box-sizing: border-box; }
  .document-table { user-select: none; pointer-events: none; }
  .document-cell { border: 1px solid #b7b7b7; overflow: hidden; }
  .document-drawing { display: block; object-fit: contain; overflow: hidden; }
  .drawing-fallback { border: 1px solid #d0d0d0; background: repeating-linear-gradient(135deg, #f3f3f3, #f3f3f3 8px, #fafafa 8px, #fafafa 16px); }
  span, button { display: block; white-space: pre; user-select: text; -webkit-user-select: text; }
  .caret-anchor { overflow: visible; }
  button { margin: 0; border: 0; padding: 0; text-align: inherit; }
  .hyperlink { cursor: pointer; text-decoration: underline; text-decoration-color: currentColor; }
  .hyperlink:focus-visible { outline: 2px solid var(--tumbler-document-accent, #42ff53); outline-offset: 1px; }
</style>
