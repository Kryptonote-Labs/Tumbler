<script lang="ts">
  import { wordDisplayColour } from './word-display-colour.ts';
  import WordPictureView from "./WordPictureView.svelte";
  import WordContentClip from "./WordContentClip.svelte";
  import WordShapeView from "./WordShapeView.svelte";
  import WordParagraphDecorations from "./WordParagraphDecorations.svelte";
  import { wordDrawingCellClip, wordTableLinesWithClips, wordImagePaintBounds, wordPointsToCssPixels, type WordImageDrawing, type WordLayoutFragment, type WordLayoutTable } from "@tumblerjs/word";
  import { wordTableBorderCss } from './word-table-style.ts';
  import OoxmlChart from "./OoxmlChart.svelte";
  import { wordTextCss, wordTextTop } from "./word-font-metrics.ts";

  interface Props {
    readonly drawingOrder?: ReadonlyMap<import('@tumblerjs/word').WordDrawing, number>;
    readonly table: WordLayoutTable;
    readonly pageIndex: number;
    readonly imageurl: (drawing: WordImageDrawing) => string;
    readonly onactivate: (event: MouseEvent | KeyboardEvent, target: string | undefined) => void;
    readonly story?: string;
    readonly decorationsOnly?: boolean;
    readonly background?: string;
  }

  let { table, drawingOrder, pageIndex, imageurl, onactivate, story, decorationsOnly = false, background = '#ffffff' }: Props = $props();

  function fragmentStyle(fragment: WordLayoutFragment, surface: string) {
    return `${wordTextCss(fragment.format, surface)};word-spacing:${wordPointsToCssPixels(fragment.wordSpacing ?? 0)}px;left:${wordPointsToCssPixels(fragment.x)}px;top:${wordPointsToCssPixels(wordTextTop(fragment))}px;width:${wordPointsToCssPixels(fragment.width)}px;height:${wordPointsToCssPixels(fragment.height)}px;line-height:${wordPointsToCssPixels(fragment.height)}px`;
  }

  function drawingStyle(fragment: WordLayoutFragment) {
    const box = fragment.drawing?.kind === 'image' && !fragment.drawing.picture ? wordImagePaintBounds(fragment.drawing, fragment.width, fragment.height) : { x: 0, y: 0, width: fragment.width, height: fragment.height };
    return `z-index:${fragment.drawing ? drawingOrder?.get(fragment.drawing) ?? 1 : 1};left:${wordPointsToCssPixels(fragment.x + box.x)}px;top:${wordPointsToCssPixels(fragment.y + box.y)}px;width:${wordPointsToCssPixels(box.width)}px;height:${wordPointsToCssPixels(box.height)}px`;
  }
</script>

{#snippet renderTable(current: WordLayoutTable, surface = background)}
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
        style={`background:${wordDisplayColour(cell.shading ?? 'transparent')};left:${wordPointsToCssPixels(cell.x - current.x)}px;top:${wordPointsToCssPixels(cell.y - current.y)}px;width:${wordPointsToCssPixels(cell.width)}px;height:${wordPointsToCssPixels(cell.height)}px`}
      ></div>
    {/each}
    {#each current.borders ?? [] as edge}
      <div style={wordTableBorderCss(edge, current.x, current.y)}></div>
    {/each}
  </div>
  {#each current.cells as cell}
    <WordContentClip clip={cell} layer={1} decorative={decorationsOnly}>
    <WordParagraphDecorations lines={cell.lines} />
    {#if !decorationsOnly}
      {#each cell.lines as line}
        {#if line.marker !== undefined}
          <span class="list-marker" aria-hidden="true" style={`${wordTextCss(line.marker.format, line.paragraphDecoration?.shading ?? cell.shading ?? surface)};left:${wordPointsToCssPixels(line.marker.x)}px;top:${wordPointsToCssPixels(wordTextTop(line.marker))}px;width:${wordPointsToCssPixels(line.marker.width)}px;height:${wordPointsToCssPixels(line.marker.height)}px;line-height:${wordPointsToCssPixels(line.marker.height)}px`}>{line.marker.text}</span>
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
          {#if fragment.kind === "drawing"}
            <!-- Drawings render separately so cell opt-outs can escape ancestor clips. -->
          {:else if fragment.hyperlink === undefined}
            <span data-story={story} data-paragraph={line.paragraphElementId} data-start={fragment.startOffset} data-end={fragment.endOffset} style={fragmentStyle(fragment, line.paragraphDecoration?.shading ?? cell.shading ?? surface)}>{fragment.text}</span>
          {:else}
            <button class="hyperlink" onkeydown={(event) => onactivate(event, fragment.hyperlink)} onclick={(event) => onactivate(event, fragment.hyperlink)} data-story={story} data-paragraph={line.paragraphElementId} data-start={fragment.startOffset} data-end={fragment.endOffset} style={fragmentStyle(fragment, line.paragraphDecoration?.shading ?? cell.shading ?? surface)}>{fragment.text}</button>
          {/if}
        {/each}
      {/each}
    {/if}
    {#each cell.tables as nested}
      {@render renderTable(nested, cell.shading ?? surface)}
    {/each}
    </WordContentClip>
  {/each}
{/snippet}

{@render renderTable(table)}

{#if !decorationsOnly}
  {#each wordTableLinesWithClips([table]) as { line, clip }}
    {#each line.fragments as fragment}
      {#if fragment.drawing}
        <WordContentClip clip={wordDrawingCellClip(fragment.drawing, clip)} layer={drawingOrder?.get(fragment.drawing) ?? (fragment.drawing.placement === 'inline' ? 1 : fragment.drawing.anchor?.behindDocument ? 0 : 2)}>
          {#if fragment.kind === "drawing" && fragment.drawing?.kind === "image"}
            {#if fragment.drawing.picture}
              <div class="document-drawing picture-drawing" style={drawingStyle(fragment)}><WordPictureView drawing={fragment.drawing} src={imageurl(fragment.drawing)} /></div>
            {:else}
              <img data-word-ink-rendering={fragment.drawing.inkRendering} class="document-drawing" src={imageurl(fragment.drawing)} alt={fragment.drawing.altText ?? ""} style={drawingStyle(fragment)} />
            {/if}
          {:else if fragment.kind === "drawing" && fragment.drawing?.kind === "shape"}
            <div class="document-drawing shape-drawing" style={drawingStyle(fragment)}><WordShapeView shape={fragment.drawing.shape} /></div>
          {:else if fragment.kind === "drawing" && fragment.drawing?.kind === "chart"}
            <div class="document-drawing" style={drawingStyle(fragment)}><OoxmlChart model={fragment.drawing.model} width={wordPointsToCssPixels(fragment.width)} height={wordPointsToCssPixels(fragment.height)} clipId={`word-table-chart-${pageIndex}-${fragment.contentElementId}`} /></div>
          {:else if fragment.kind === "drawing"}
            <div class="document-drawing drawing-fallback" role="img" aria-label={fragment.drawing?.altText ?? "Drawing preview unavailable"} style={drawingStyle(fragment)}></div>
          {/if}
        </WordContentClip>
      {/if}
    {/each}
  {/each}
{/if}

<style>
  .document-table, .document-cell, .document-drawing, span, button { position: absolute; box-sizing: border-box; }
  .document-table { user-select: none; pointer-events: none; }
  .document-cell { overflow: hidden; }
  .document-drawing { display: block; object-fit: fill; overflow: hidden; }
  .shape-drawing, .picture-drawing { overflow: visible; }
  .drawing-fallback { border: 1px solid #d0d0d0; background: repeating-linear-gradient(135deg, #f3f3f3, #f3f3f3 8px, #fafafa 8px, #fafafa 16px); }
  span, button { display: block; white-space: pre; user-select: text; -webkit-user-select: text; }
  .caret-anchor { overflow: visible; }
  button { margin: 0; border: 0; padding: 0; text-align: inherit; }
  .hyperlink { cursor: pointer; text-decoration: underline; text-decoration-color: currentColor; }
  .hyperlink:focus-visible { outline: 2px solid var(--tumbler-document-accent, #42ff53); outline-offset: 1px; }
</style>
