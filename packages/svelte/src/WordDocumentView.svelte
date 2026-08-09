<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { layoutWordDocument, wordPointsToCssPixels, type WordDocument, type WordImageDrawing, type WordLayout, type WordTextPosition, type WordTextSelection } from "@tumblerjs/word";
  import OoxmlChart from "./OoxmlChart.svelte";
  import { browserWordTextMeasurer, wordTextCss } from "./word-font-metrics.ts";
  import { calculateWordPageViewport, type WordPageViewport } from "./word-page-viewport.ts";
  import { wordInputEdit, type WordDocumentEdit } from "./word-editing.ts";

  interface Props {
    readonly wordDocument: WordDocument;
    readonly onhyperlink?: (target: string) => void;
    readonly editable?: boolean;
    readonly selection?: WordTextSelection;
    readonly onselectionchange?: (selection: WordTextSelection) => void;
    readonly onedit?: (edit: WordDocumentEdit) => void;
    readonly oncommand?: (command: "undo" | "redo" | "save") => void;
    readonly scale?: number;
  }

  let { wordDocument, onhyperlink, editable = false, selection, onselectionchange, onedit, oncommand, scale = 1 }: Props = $props();
  let scroller = $state<HTMLDivElement>();
  let layout = $state<WordLayout>();
  let viewport = $state<WordPageViewport>();
  let mounted = $state(false);
  let editingFocused = $state(false);
  const imageUrls = new WeakMap<Uint8Array, string>();
  const createdUrls = new Set<string>();

  onDestroy(() => createdUrls.forEach((url) => URL.revokeObjectURL(url)));

  onMount(() => {
    mounted = true;
    void globalThis.document.fonts?.ready.then(reflow);
    reflow();
    const fonts = globalThis.document.fonts;
    fonts?.addEventListener("loadingdone", reflow);
    globalThis.document.addEventListener("selectionchange", readBrowserSelection);
    return () => {
      fonts?.removeEventListener("loadingdone", reflow);
      globalThis.document.removeEventListener("selectionchange", readBrowserSelection);
    };
  });

  $effect(() => {
    wordDocument;
    scale;
    selection;
    if (mounted) {
      reflow();
      queueMicrotask(restoreBrowserSelection);
    }
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
    if (editable && !(event instanceof MouseEvent && (event.ctrlKey || event.metaKey))) return;
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onhyperlink(target);
  }

  function readBrowserSelection() {
    if (!editable || scroller === undefined) return;
    const browserSelection = globalThis.getSelection();
    if (browserSelection === null || browserSelection.rangeCount === 0 || !scroller.contains(browserSelection.anchorNode)) return;
    const anchor = logicalPosition(browserSelection.anchorNode, browserSelection.anchorOffset);
    const focus = logicalPosition(browserSelection.focusNode, browserSelection.focusOffset);
    if (anchor !== undefined && focus !== undefined) onselectionchange?.({ anchor, focus });
  }

  function restoreBrowserSelection() {
    if (!editable || !editingFocused || selection === undefined || scroller === undefined) return;
    const anchor = browserPoint(selection.anchor);
    const focus = browserPoint(selection.focus);
    if (anchor === undefined || focus === undefined) return;
    globalThis.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  }

  function browserPoint(position: WordTextPosition): { node: Node; offset: number } | undefined {
    if (scroller === undefined) return undefined;
    const fragments = [...scroller.querySelectorAll<HTMLElement>(`[data-paragraph="${position.paragraphElementId}"][data-start][data-end]:not([data-story])`)]
      .filter((fragment) => Number(fragment.dataset.start) <= position.offset && Number(fragment.dataset.end) >= position.offset);
    const fragment = position.affinity === "before" ? fragments.at(-1) : fragments[0];
    if (fragment === undefined) return undefined;
    const node = fragment.firstChild ?? fragment;
    return { node, offset: Math.max(0, Math.min(node.textContent?.length ?? 0, position.offset - Number(fragment.dataset.start))) };
  }

  function logicalPosition(node: Node | null, offset: number): WordTextPosition | undefined {
    const element = node instanceof Element ? node : node?.parentElement;
    const fragment = element?.closest<HTMLElement>("[data-paragraph][data-start][data-end]");
    if (fragment === null || fragment === undefined || fragment.dataset.story !== undefined) return undefined;
    const paragraphElementId = Number(fragment.dataset.paragraph);
    const start = Number(fragment.dataset.start);
    const end = Number(fragment.dataset.end);
    if (!Number.isInteger(paragraphElementId) || !Number.isInteger(start) || !Number.isInteger(end)) return undefined;
    const local = node?.nodeType === Node.TEXT_NODE ? offset : offset === 0 ? 0 : fragment.textContent?.length ?? 0;
    return { paragraphElementId, offset: Math.min(end, start + local), affinity: local === 0 ? "before" : "after" };
  }

  function handleBeforeInput(event: InputEvent) {
    if (!editable || selection === undefined) return;
    const edit = wordInputEdit(wordDocument, selection, event.inputType, event.data);
    if (edit === undefined) return;
    event.preventDefault();
    onedit?.(edit);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!editable || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const command = key === "s" ? "save" : key === "z" ? event.shiftKey ? "redo" : "undo" : key === "y" ? "redo" : undefined;
    if (command === undefined) return;
    event.preventDefault();
    oncommand?.(command);
  }

  function fragmentStyle(fragment: NonNullable<WordLayout["pages"][number]["columns"][number]["lines"][number]["fragments"][number]>, offsetX = 0, offsetY = 0) {
    return `${wordTextCss(fragment.format)};left:${wordPointsToCssPixels(fragment.x - offsetX)}px;top:${wordPointsToCssPixels(fragment.y - offsetY)}px;width:${wordPointsToCssPixels(fragment.width)}px;height:${wordPointsToCssPixels(fragment.height)}px;line-height:${wordPointsToCssPixels(fragment.height)}px`;
  }

  function drawingStyle(fragment: NonNullable<WordLayout["pages"][number]["columns"][number]["lines"][number]["fragments"][number]>, offsetX = 0, offsetY = 0) {
    return `left:${wordPointsToCssPixels(fragment.x - offsetX)}px;top:${wordPointsToCssPixels(fragment.y - offsetY)}px;width:${wordPointsToCssPixels(fragment.width)}px;height:${wordPointsToCssPixels(fragment.height)}px`;
  }

  function imageUrl(drawing: WordImageDrawing): string {
    const existing = imageUrls.get(drawing.bytes);
    if (existing !== undefined) return existing;
    const url = URL.createObjectURL(new Blob([Uint8Array.from(drawing.bytes).buffer], { type: drawing.contentType }));
    imageUrls.set(drawing.bytes, url);
    createdUrls.add(url);
    return url;
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
          <div
            class="word-page-content"
            class:editable
            contenteditable={editable}
            role={editable ? "textbox" : undefined}
            aria-multiline={editable ? "true" : undefined}
            aria-label={editable ? `Edit page ${page.index + 1}` : undefined}
            spellcheck={editable}
            autocapitalize="sentences"
            data-form-type="other"
            data-lpignore="true"
            onfocusin={() => editingFocused = true}
            onfocusout={(event) => {
              if (!(event.relatedTarget instanceof Node) || !scroller?.contains(event.relatedTarget)) editingFocused = false;
            }}
            onbeforeinput={handleBeforeInput}
            onkeydown={handleKeydown}
            style={`width:${wordPointsToCssPixels(page.width)}px;height:${wordPointsToCssPixels(page.height)}px;transform:scale(${scale});transform-origin:top left`}
          >
            {#if page.noteSeparatorY !== undefined}
              <div class="note-separator" style={`left:${wordPointsToCssPixels(page.section.marginLeftTwips / 20)}px;top:${wordPointsToCssPixels(page.noteSeparatorY)}px`}></div>
            {/if}
            {#each [...page.headerLines, ...page.footerLines, ...page.noteLines] as line}
              {#if line.marker !== undefined}
                <span class="list-marker" aria-hidden="true" style={`${wordTextCss(line.marker.format)};left:${wordPointsToCssPixels(line.marker.x)}px;top:${wordPointsToCssPixels(line.marker.y)}px;width:${wordPointsToCssPixels(line.marker.width)}px;height:${wordPointsToCssPixels(line.marker.height)}px;line-height:${wordPointsToCssPixels(line.marker.height)}px`}>{line.marker.text}</span>
              {/if}
              {#each line.fragments as fragment}
                {#if fragment.kind === "drawing" && fragment.drawing?.kind === "image"}
                  <img class="document-drawing" src={imageUrl(fragment.drawing)} alt={fragment.drawing.altText ?? ""} style={drawingStyle(fragment)} />
                {:else if fragment.kind === "drawing" && fragment.drawing?.kind === "chart"}
                  <div class="document-drawing" style={drawingStyle(fragment)}><OoxmlChart model={fragment.drawing.model} width={wordPointsToCssPixels(fragment.width)} height={wordPointsToCssPixels(fragment.height)} clipId={`word-chart-${page.index}-${fragment.contentElementId}`} /></div>
                {:else if fragment.kind === "drawing"}
                  <div class="document-drawing drawing-fallback" role="img" aria-label={fragment.drawing?.altText ?? "Drawing preview unavailable"} style={drawingStyle(fragment)}></div>
                {:else if fragment.hyperlink === undefined}
                  <span data-story="header-footer" data-paragraph={line.paragraphElementId} data-start={fragment.startOffset} data-end={fragment.endOffset} style={fragmentStyle(fragment)}>{fragment.text}</span>
                {:else}
                  <button class="hyperlink" onkeydown={(event) => activateHyperlink(event, fragment.hyperlink)} onclick={(event) => activateHyperlink(event, fragment.hyperlink)} data-story="header-footer" data-paragraph={line.paragraphElementId} data-start={fragment.startOffset} data-end={fragment.endOffset} style={fragmentStyle(fragment)}>{fragment.text}</button>
                {/if}
              {/each}
            {/each}
            {#each page.columns as column}
              {#each column.tables as table}
                <div
                  class="document-table"
                  data-table={table.tableElementId}
                  style={`left:${wordPointsToCssPixels(table.x)}px;top:${wordPointsToCssPixels(table.y)}px;width:${wordPointsToCssPixels(table.width)}px;height:${wordPointsToCssPixels(table.height)}px`}
                >
                  {#each table.cells as cell}
                    <div
                      class="document-cell"
                      data-cell={cell.cellElementId}
                      style={`left:${wordPointsToCssPixels(cell.x - table.x)}px;top:${wordPointsToCssPixels(cell.y - table.y)}px;width:${wordPointsToCssPixels(cell.width)}px;height:${wordPointsToCssPixels(cell.height)}px`}
                    ></div>
                    {#each cell.lines as line}
                      {#if line.marker !== undefined}
                        <span class="list-marker" aria-hidden="true" style={`${wordTextCss(line.marker.format)};left:${wordPointsToCssPixels(line.marker.x - table.x)}px;top:${wordPointsToCssPixels(line.marker.y - table.y)}px;width:${wordPointsToCssPixels(line.marker.width)}px;height:${wordPointsToCssPixels(line.marker.height)}px;line-height:${wordPointsToCssPixels(line.marker.height)}px`}>{line.marker.text}</span>
                      {/if}
                      {#each line.fragments as fragment}
                        {#if fragment.kind === "drawing" && fragment.drawing?.kind === "image"}
                          <img class="document-drawing" src={imageUrl(fragment.drawing)} alt={fragment.drawing.altText ?? ""} style={drawingStyle(fragment, table.x, table.y)} />
                        {:else if fragment.kind === "drawing" && fragment.drawing?.kind === "chart"}
                          <div class="document-drawing" style={drawingStyle(fragment, table.x, table.y)}><OoxmlChart model={fragment.drawing.model} width={wordPointsToCssPixels(fragment.width)} height={wordPointsToCssPixels(fragment.height)} clipId={`word-table-chart-${page.index}-${fragment.contentElementId}`} /></div>
                        {:else if fragment.kind === "drawing"}
                          <div class="document-drawing drawing-fallback" role="img" aria-label={fragment.drawing?.altText ?? "Drawing preview unavailable"} style={drawingStyle(fragment, table.x, table.y)}></div>
                        {:else if fragment.hyperlink === undefined}
                          <span data-paragraph={line.paragraphElementId} data-start={fragment.startOffset} data-end={fragment.endOffset} style={fragmentStyle(fragment, table.x, table.y)}>{fragment.text}</span>
                        {:else}
                          <button class="hyperlink" onkeydown={(event) => activateHyperlink(event, fragment.hyperlink)} onclick={(event) => activateHyperlink(event, fragment.hyperlink)} data-paragraph={line.paragraphElementId} data-start={fragment.startOffset} data-end={fragment.endOffset} style={fragmentStyle(fragment, table.x, table.y)}>{fragment.text}</button>
                        {/if}
                      {/each}
                    {/each}
                  {/each}
                </div>
              {/each}
              {#each column.lines as line}
                {#if line.marker !== undefined}
                  <span
                    class="list-marker"
                    aria-hidden="true"
                    style={`${wordTextCss(line.marker.format)};left:${wordPointsToCssPixels(line.marker.x)}px;top:${wordPointsToCssPixels(line.marker.y)}px;width:${wordPointsToCssPixels(line.marker.width)}px;height:${wordPointsToCssPixels(line.marker.height)}px;line-height:${wordPointsToCssPixels(line.marker.height)}px`}
                  >{line.marker.text}</span>
                {/if}
                {#each line.fragments as fragment}
                  {#if fragment.kind === "drawing" && fragment.drawing?.kind === "image"}
                    <img class="document-drawing" src={imageUrl(fragment.drawing)} alt={fragment.drawing.altText ?? ""} style={drawingStyle(fragment)} />
                  {:else if fragment.kind === "drawing" && fragment.drawing?.kind === "chart"}
                    <div class="document-drawing" style={drawingStyle(fragment)}><OoxmlChart model={fragment.drawing.model} width={wordPointsToCssPixels(fragment.width)} height={wordPointsToCssPixels(fragment.height)} clipId={`word-body-chart-${page.index}-${fragment.contentElementId}`} /></div>
                  {:else if fragment.kind === "drawing"}
                    <div class="document-drawing drawing-fallback" role="img" aria-label={fragment.drawing?.altText ?? "Drawing preview unavailable"} style={drawingStyle(fragment)}></div>
                  {:else if fragment.hyperlink === undefined}
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
  .word-page-content.editable { outline: 0; caret-color: var(--tumbler-document-accent, #25a735); }
  .document-table { position: absolute; }
  .document-cell { position: absolute; box-sizing: border-box; border: 1px solid #b7b7b7; }
  .document-drawing { position: absolute; display: block; object-fit: contain; overflow: hidden; }
  .drawing-fallback { background: repeating-linear-gradient(135deg, #f3f3f3, #f3f3f3 8px, #fafafa 8px, #fafafa 16px); border: 1px solid #d0d0d0; }
  .note-separator { position: absolute; width: 96px; border-top: 1px solid #777; }
  span, button { position: absolute; display: block; box-sizing: border-box; white-space: pre; user-select: text; -webkit-user-select: text; }
  button { margin: 0; border: 0; padding: 0; text-align: inherit; }
  .hyperlink { cursor: pointer; text-decoration: underline; text-decoration-color: currentColor; }
  .hyperlink:focus-visible { outline: 2px solid var(--tumbler-document-accent, #42ff53); outline-offset: 1px; }
</style>
