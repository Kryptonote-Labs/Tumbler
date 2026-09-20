<script lang="ts">
  import { flushSync, onDestroy, onMount, untrack } from "svelte";
  import { layoutWordDocument, wordParagraphText, wordPointsToCssPixels, type WordDocument, type WordImageDrawing, type WordLayout, type WordTextPosition, type WordTextSelection } from "@tumblerjs/word";
  import { zoomGesture } from "./zoom-gesture.ts";
  import OoxmlChart from "./OoxmlChart.svelte";
  import WordLayoutTableView from "./WordLayoutTableView.svelte";
  import { browserWordTextMeasurer, wordTextCss } from "./word-font-metrics.ts";
  import { calculateWordPageViewport, type WordPageViewport } from "./word-page-viewport.ts";
  import { sameWordTextSelection, wordDocumentParagraphs, wordInputEdit, type WordDocumentEdit } from "./word-editing.ts";

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

  let { wordDocument, onhyperlink, editable = false, selection, onselectionchange, onedit, oncommand, scale = $bindable(1) }: Props = $props();
  let scroller = $state<HTMLDivElement>();
  let viewportWidth = $state(0);
  let layout = $state<WordLayout>();
  let viewport = $state<WordPageViewport>();
  let mounted = $state(false);
  let editingFocused = $state(false);
  let inputSelectionOverride: WordTextSelection | undefined;
  let pointerType = "mouse";
  let dragPoint: { x: number; y: number } | undefined;
  let scrollFrame = 0;
  let mouseSelection: { origin: WordTextSelection; granularity: "character" | "word" | "paragraph" } | undefined;
  let paragraphs = $derived(wordDocumentParagraphs(wordDocument));
  let paragraphOrder = $derived(new Map(paragraphs.map((paragraph, index) => [paragraph.elementId, index])));
  let paragraphText = $derived(new Map(paragraphs.map(paragraph => [paragraph.elementId, wordParagraphText(wordDocument, paragraph)])));
  const imageUrls = new WeakMap<Uint8Array, string>();
  const createdUrls = new Set<string>();

  onDestroy(() => {
    createdUrls.forEach((url) => URL.revokeObjectURL(url));
    finishMouseSelection();
  });

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
    if (mounted) {
      // Reflow reads its freshly-written layout to derive the viewport; that output is not an input dependency.
      untrack(reflow);
    }
  });

  $effect(() => {
    scale;
    if (mounted) untrack(updateViewport);
  });

  $effect(() => {
    selection;
    if (mounted) queueMicrotask(restoreBrowserSelection);
  });

  /** Keep the document point under the gesture stationary as pages resize and recenter. */
  function zoomAt(next: number, x: number, y: number, targetX = x, targetY = y) {
    if (scroller === undefined || layout === undefined || viewport === undefined) return;
    next = Math.max(0.25, Math.min(3, next));
    const rect = scroller.getBoundingClientRect();
    const localX = x - rect.left;
    const localY = y - rect.top;
    const documentY = (scroller.scrollTop + localY) / scale;
    let pageIndex = 0;
    while (pageIndex + 1 < layout.pages.length && viewport.offsets[pageIndex + 1]! <= documentY) pageIndex++;
    const page = layout.pages[pageIndex];
    if (page === undefined) return;
    const pageWidth = wordPointsToCssPixels(page.width);
    const left = Math.max(24 * scale, (viewportWidth - pageWidth * scale) / 2);
    const documentX = (scroller.scrollLeft + localX - left) / scale;
    flushSync(() => { scale = next; });
    const nextLeft = Math.max(24 * scale, (viewportWidth - pageWidth * scale) / 2);
    scroller.scrollLeft = nextLeft + documentX * scale - (targetX - rect.left);
    scroller.scrollTop = documentY * scale - (targetY - rect.top);
    updateViewport();
  }

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

  /** Returns keyboard input to the controlled caret after a host toolbar action. */
  export function focusEditor() {
    if (!editable || scroller === undefined) return;
    editingFocused = true;
    scroller.querySelector<HTMLElement>(".word-page-content")?.focus({ preventScroll: true });
    queueMicrotask(restoreBrowserSelection);
  }

  function activateHyperlink(event: MouseEvent | KeyboardEvent, target: string | undefined) {
    if (target === undefined) return;
    if (editable && !(event instanceof MouseEvent && (event.ctrlKey || event.metaKey))) return;
    if (event instanceof KeyboardEvent && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    if (target.startsWith("#") && scrollToBookmark(target.slice(1))) return;
    if (onhyperlink === undefined) return;
    onhyperlink(target);
  }

  function scrollToBookmark(name: string): boolean {
    if (layout === undefined || viewport === undefined || scroller === undefined) return false;
    const paragraphElementId = bookmarkParagraph(wordDocument.blocks, name);
    if (paragraphElementId === undefined) return false;
    const page = layout.pages.find((candidate) => candidate.columns.some((column) =>
      column.lines.some((line) => line.paragraphElementId === paragraphElementId) ||
      column.tables.some((table) => tableContainsParagraph(table, paragraphElementId))
    ));
    if (page === undefined) return false;
    scroller.scrollTop = viewport.offsets[page.index]! * scale;
    updateViewport();
    onselectionchange?.({ anchor: { paragraphElementId, offset: 0 }, focus: { paragraphElementId, offset: 0 } });
    return true;
  }

  function bookmarkParagraph(blocks: WordDocument["blocks"], name: string): number | undefined {
    for (const block of blocks) {
      if (block.kind === "paragraph" && block.inlines.some((inline) => inline.kind === "bookmark-start" && inline.name === name)) return block.elementId;
      if (block.kind === "table") for (const row of block.rows) for (const cell of row.cells) {
        const found = bookmarkParagraph(cell.blocks, name);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  }

  function tableContainsParagraph(table: WordLayout["pages"][number]["columns"][number]["tables"][number], paragraphElementId: number): boolean {
    return table.cells.some((cell) =>
      cell.lines.some((line) => line.paragraphElementId === paragraphElementId) ||
      cell.tables.some((nested) => tableContainsParagraph(nested, paragraphElementId))
    );
  }

  function readBrowserSelection() {
    if (!editable || mouseSelection !== undefined) return;
    const next = browserTextSelection();
    if (next !== undefined && !sameWordTextSelection(selection, next)) onselectionchange?.(next);
  }

  function browserTextSelection(): WordTextSelection | undefined {
    if (scroller === undefined) return undefined;
    const browserSelection = globalThis.getSelection();
    if (browserSelection === null || browserSelection.rangeCount === 0 || !scroller.contains(browserSelection.anchorNode)) return undefined;
    const anchor = logicalPosition(browserSelection.anchorNode, browserSelection.anchorOffset);
    const focus = logicalPosition(browserSelection.focusNode, browserSelection.focusOffset);
    return anchor === undefined || focus === undefined ? undefined : { anchor, focus };
  }

  function restoreBrowserSelection() {
    if (!editable || !editingFocused || selection === undefined || scroller === undefined || mouseSelection !== undefined) return;
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
    if (!editable) return;
    // Keyboard navigation changes the DOM selection before Svelte can publish controlled state.
    const activeSelection = inputSelectionOverride ?? browserTextSelection() ?? selection;
    inputSelectionOverride = undefined;
    if (activeSelection === undefined) return;
    const edit = wordInputEdit(wordDocument, activeSelection, event.inputType, event.data);
    if (edit === undefined) return;
    event.preventDefault();
    onedit?.(edit);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) inputSelectionOverride = undefined;
    if (!editable || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "a") {
      const paragraphs = wordDocumentParagraphs(wordDocument);
      const first = paragraphs[0];
      const last = paragraphs.at(-1);
      if (first === undefined || last === undefined) return;
      event.preventDefault();
      const next = {
        anchor: { paragraphElementId: first.elementId, offset: 0 },
        focus: { paragraphElementId: last.elementId, offset: wordParagraphText(wordDocument, last).length },
      };
      inputSelectionOverride = next;
      onselectionchange?.(next);
      queueMicrotask(restoreBrowserSelection);
      return;
    }
    const command = key === "s" ? "save" : key === "z" ? event.shiftKey ? "redo" : "undo" : key === "y" ? "redo" : undefined;
    if (command === undefined) return;
    event.preventDefault();
    oncommand?.(command);
  }

  /** Body text must follow document order, including paragraphs inside tables. */
  function bodyLines(page: WordLayout["pages"][number]) {
    return page.columns.flatMap(column => [...column.lines, ...tableLines(column.tables)])
      .sort((left, right) => (paragraphOrder.get(left.paragraphElementId) ?? 0) - (paragraphOrder.get(right.paragraphElementId) ?? 0) || left.startOffset - right.startOffset);
  }

  function positionOrder(left: WordTextPosition, right: WordTextPosition) {
    return (paragraphOrder.get(left.paragraphElementId) ?? 0) - (paragraphOrder.get(right.paragraphElementId) ?? 0) || left.offset - right.offset;
  }

  function selectionExtent(position: WordTextPosition, granularity: "character" | "word" | "paragraph"): WordTextSelection {
    const text = paragraphText.get(position.paragraphElementId);
    if (granularity === "character" || text === undefined) return { anchor: position, focus: position };
    const segment = granularity === "word"
      ? [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)].find(item => item.index + item.segment.length > Math.min(position.offset, text.length - 1))
      : undefined;
    return {
      anchor: { paragraphElementId: position.paragraphElementId, offset: segment?.index ?? 0 },
      focus: { paragraphElementId: position.paragraphElementId, offset: segment === undefined ? text.length : segment.index + segment.segment.length },
    };
  }

  function setPointerSelection(next: WordTextSelection) {
    const anchor = browserPoint(next.anchor);
    const focus = browserPoint(next.focus);
    if (anchor !== undefined && focus !== undefined) {
      globalThis.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
      inputSelectionOverride = undefined;
    } else {
      inputSelectionOverride = next;
    }
    if (editable) onselectionchange?.(next);
  }

  function handlePageMouseDown(event: MouseEvent) {
    if (event.button !== 0 || pointerType === "touch" || !(event.currentTarget instanceof HTMLElement)) return;
    if ((event.target as Element | null)?.closest("[data-story]")) return;
    if ((event.ctrlKey || event.metaKey) && (event.target as Element | null)?.closest(".hyperlink")) return;
    const position = pointerPosition(event.clientX, event.clientY);
    if (position === undefined) return;
    const previous = browserTextSelection() ?? selection;
    const granularity = event.detail >= 3 ? "paragraph" : event.detail === 2 ? "word" : "character";
    const next = event.shiftKey && previous !== undefined
      ? { anchor: previous.anchor, focus: position }
      : selectionExtent(position, granularity);
    mouseSelection = {
      origin: event.shiftKey ? { anchor: next.anchor, focus: next.anchor } : next,
      granularity: event.shiftKey ? "character" : granularity,
    };
    event.preventDefault();
    dragPoint = { x: event.clientX, y: event.clientY };
    inputSelectionOverride = undefined;
    if (editable) { event.currentTarget.focus({ preventScroll: true }); editingFocused = true; }
    setPointerSelection(next);
  }

  function handleSelectionMove(event: MouseEvent) {
    if (mouseSelection === undefined) return;
    if ((event.buttons & 1) === 0) { finishMouseSelection(); return; }
    event.preventDefault();
    dragPoint = { x: event.clientX, y: event.clientY };
    extendMouseSelection();
    if (scrollFrame === 0) scrollFrame = requestAnimationFrame(scrollDuringSelection);
  }

  function extendMouseSelection() {
    if (mouseSelection === undefined || dragPoint === undefined) return;
    const position = pointerPosition(dragPoint.x, dragPoint.y);
    if (position === undefined) return;
    const extent = selectionExtent(position, mouseSelection.granularity);
    const backwards = positionOrder(position, mouseSelection.origin.anchor) < 0;
    setPointerSelection({
      anchor: backwards ? mouseSelection.origin.focus : mouseSelection.origin.anchor,
      focus: backwards ? extent.anchor : extent.focus,
    });
  }

  function scrollDuringSelection() {
    scrollFrame = 0;
    if (mouseSelection === undefined || dragPoint === undefined || scroller === undefined) return;
    const rect = scroller.getBoundingClientRect();
    const speed = (point: number, start: number, end: number) => point < start ? Math.max(-18, (point - start) / 3) : point > end ? Math.min(18, (point - end) / 3) : 0;
    const previousTop = scroller.scrollTop;
    const previousLeft = scroller.scrollLeft;
    scroller.scrollBy(speed(dragPoint.x, rect.left, rect.right), speed(dragPoint.y, rect.top, rect.bottom));
    if (scroller.scrollTop !== previousTop || scroller.scrollLeft !== previousLeft) {
      updateViewport();
      extendMouseSelection();
      scrollFrame = requestAnimationFrame(scrollDuringSelection);
    }
  }

  function finishMouseSelection() {
    mouseSelection = undefined;
    dragPoint = undefined;
    if (scrollFrame !== 0) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
  }

  /** Hit-test the nearest laid-out line, rather than letting whitespace select arbitrary DOM nodes. */
  function pointerPosition(clientX: number, clientY: number): WordTextPosition | undefined {
    if (scroller === undefined || layout === undefined) return;
    const pages = [...scroller.querySelectorAll<HTMLElement>(".word-page-content")];
    const pageElement = pages.reduce<HTMLElement | undefined>((closest, candidate) => {
      const distance = (element: HTMLElement) => { const rect = element.getBoundingClientRect(); return Math.max(rect.top - clientY, clientY - rect.bottom, 0); };
      return closest === undefined || distance(candidate) < distance(closest) ? candidate : closest;
    }, undefined);
    const page = layout.pages.find(item => item.index === Number(pageElement?.dataset.page));
    if (pageElement === undefined || page === undefined) return;
    const lines = bodyLines(page);
    if (lines.length === 0) return;
    const rect = pageElement.getBoundingClientRect();
    const x = (clientX - rect.left) / scale;
    const y = (clientY - rect.top) / scale;
    const horizontalDistance = (line: typeof lines[number]) => Math.max(wordPointsToCssPixels(line.x) - x, x - wordPointsToCssPixels(line.x + line.width), 0);
    const line = lines.reduce((closest, candidate) => {
      const vertical = lineDistance(candidate, y) - lineDistance(closest, y);
      return vertical < 0 || vertical === 0 && horizontalDistance(candidate) < horizontalDistance(closest) ? candidate : closest;
    });
    const position = (offset: number): WordTextPosition => ({ paragraphElementId: line.paragraphElementId, offset });
    if (x <= wordPointsToCssPixels(line.x)) return position(line.startOffset);
    if (x >= wordPointsToCssPixels(line.x + line.width)) return position(line.endOffset);
    const fragments = line.fragments.filter(fragment => fragment.kind !== "drawing");
    const fragment = fragments.reduce<typeof fragments[number] | undefined>((closest, candidate) => {
      const distance = (item: typeof candidate) => Math.max(wordPointsToCssPixels(item.x) - x, x - wordPointsToCssPixels(item.x + item.width), 0);
      return closest === undefined || distance(candidate) < distance(closest) ? candidate : closest;
    }, undefined);
    if (fragment === undefined) return position(line.startOffset);
    const element = pageElement.querySelector<HTMLElement>(`[data-paragraph="${line.paragraphElementId}"][data-start="${fragment.startOffset}"][data-end="${fragment.endOffset}"]:not(.caret-anchor):not([data-story])`);
    if (element?.firstChild?.nodeType !== Node.TEXT_NODE) return position(fragment.startOffset);
    const bounds = element.getBoundingClientRect();
    const hitX = Math.max(bounds.left + 0.01, Math.min(bounds.right - 0.01, clientX));
    const hitY = bounds.top + bounds.height / 2;
    const document = globalThis.document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const caret = document.caretPositionFromPoint?.(hitX, hitY);
    const range = caret === undefined ? document.caretRangeFromPoint?.(hitX, hitY) : undefined;
    const node = caret?.offsetNode ?? range?.startContainer;
    const offset = caret?.offset ?? range?.startOffset;
    if (node !== undefined && element.contains(node) && offset !== undefined) return logicalPosition(node, offset);
    // Some engines cannot hit-test positioned text. Measure grapheme boundaries as a fallback.
    const text = element.textContent ?? "";
    const boundaries = [0, ...[...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(segment => segment.index + segment.segment.length)];
    const measure = document.createRange();
    const rtl = getComputedStyle(element).direction === "rtl";
    let nearest = 0;
    let distance = Infinity;
    for (const boundary of boundaries) {
      measure.setStart(element.firstChild, 0);
      measure.setEnd(element.firstChild, boundary);
      const box = measure.getBoundingClientRect();
      const delta = Math.abs((rtl ? box.left : box.right) - clientX);
      if (delta < distance) { distance = delta; nearest = boundary; }
    }
    return position(Math.min(fragment.endOffset, fragment.startOffset + nearest));
  }

  function tableLines(tables: readonly WordLayout["pages"][number]["columns"][number]["tables"][number][]): WordLayout["pages"][number]["columns"][number]["lines"] {
    return tables.flatMap((table) => table.cells.flatMap((cell) => [
      ...cell.lines,
      ...tableLines(cell.tables),
    ]));
  }

  function lineDistance(line: WordLayout["pages"][number]["columns"][number]["lines"][number], y: number): number {
    const top = wordPointsToCssPixels(line.y);
    const bottom = wordPointsToCssPixels(line.y + line.height);
    return y < top ? top - y : y > bottom ? y - bottom : 0;
  }

  function fragmentStyle(fragment: NonNullable<WordLayout["pages"][number]["columns"][number]["lines"][number]["fragments"][number]>, offsetX = 0, offsetY = 0) {
    return `${wordTextCss(fragment.format)};left:${wordPointsToCssPixels(fragment.x - offsetX)}px;top:${wordPointsToCssPixels(fragment.y - offsetY)}px;width:${wordPointsToCssPixels(fragment.width)}px;height:${wordPointsToCssPixels(fragment.height)}px;line-height:${wordPointsToCssPixels(fragment.height)}px`;
  }

  /** Inline runs keep browser word boundaries intact across formatting changes. */
  function inlineFragmentStyle(line: WordLayout["pages"][number]["columns"][number]["lines"][number], index: number) {
    const fragment = line.fragments[index]!;
    const previous = line.fragments.slice(0, index).findLast(item => item.kind !== "drawing");
    const gap = fragment.x - (previous === undefined ? line.x : previous.x + previous.width);
    return `${wordTextCss(fragment.format)};margin-left:${wordPointsToCssPixels(gap)}px;top:${wordPointsToCssPixels(fragment.y - line.y)}px;line-height:${wordPointsToCssPixels(fragment.height)}px`;
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

<svelte:window onmousemove={handleSelectionMove} onmouseup={finishMouseSelection} onblur={finishMouseSelection} />

<div
  class="word-scroller"
  bind:this={scroller}
  bind:clientWidth={viewportWidth}
  use:zoomGesture={(gesture) => { finishMouseSelection(); zoomAt(scale * gesture.factor, gesture.x, gesture.y, gesture.targetX, gesture.targetY); }}
  aria-label="Document pages"
  onscroll={updateViewport}
  style={`--word-scale:${scale}`}
>
  {#if layout !== undefined && viewport !== undefined}
    <div class="word-surface" style={`height:${viewport.totalHeight * scale}px;width:${viewport.totalWidth * scale}px`}>
      {#each layout.pages.slice(viewport.first, viewport.last + 1) as page, localIndex (page.index)}
        {@const pageIndex = viewport.first + localIndex}
        <section
          class="word-page"
          aria-label={`Page ${page.index + 1}`}
          style={`left:${Math.max(24 * scale, (viewportWidth - wordPointsToCssPixels(page.width) * scale) / 2)}px;top:${viewport.offsets[pageIndex]! * scale}px;width:${wordPointsToCssPixels(page.width) * scale}px;height:${wordPointsToCssPixels(page.height) * scale}px`}
        >
          <div
            class="word-page-content"
            data-page={page.index}
            class:editable
            contenteditable={editable}
            role={editable ? "textbox" : undefined}
            aria-multiline={editable ? "true" : undefined}
            aria-label={editable ? `Edit page ${page.index + 1}` : undefined}
            spellcheck={editable}
            autocapitalize="sentences"
            data-form-type="other"
            data-lpignore="true"
            onpointerdown={(event) => pointerType = event.pointerType}
            onmousedown={handlePageMouseDown}
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
            {#each [...page.headerTables, ...page.footerTables, ...page.noteTables] as table}
              <WordLayoutTableView {table} pageIndex={page.index} imageurl={imageUrl} onactivate={activateHyperlink} story="auxiliary" />
            {/each}
            {#each page.columns as column}
              {#each column.tables as table}
                <WordLayoutTableView {table} pageIndex={page.index} imageurl={imageUrl} onactivate={activateHyperlink} decorationsOnly />
              {/each}
            {/each}
            {#each bodyLines(page) as line}
              {#if line.marker !== undefined}
                <span
                  class="list-marker"
                  aria-hidden="true"
                  style={`${wordTextCss(line.marker.format)};left:${wordPointsToCssPixels(line.marker.x)}px;top:${wordPointsToCssPixels(line.marker.y)}px;width:${wordPointsToCssPixels(line.marker.width)}px;height:${wordPointsToCssPixels(line.marker.height)}px;line-height:${wordPointsToCssPixels(line.marker.height)}px`}
                >{line.marker.text}</span>
              {/if}

              <div class="text-line" style={`left:${wordPointsToCssPixels(line.x)}px;top:${wordPointsToCssPixels(line.y)}px;height:${wordPointsToCssPixels(line.height)}px`}>
                {#each line.fragments as fragment, fragmentIndex}
                  {#if fragment.kind === "drawing" && fragment.drawing?.kind === "image"}
                    <img class="document-drawing" src={imageUrl(fragment.drawing)} alt={fragment.drawing.altText ?? ""} style={drawingStyle(fragment, line.x, line.y)} />
                  {:else if fragment.kind === "drawing" && fragment.drawing?.kind === "chart"}
                    <div class="document-drawing" style={drawingStyle(fragment, line.x, line.y)}><OoxmlChart model={fragment.drawing.model} width={wordPointsToCssPixels(fragment.width)} height={wordPointsToCssPixels(fragment.height)} clipId={`word-body-chart-${page.index}-${fragment.contentElementId}`} /></div>
                  {:else if fragment.kind === "drawing"}
                    <div class="document-drawing drawing-fallback" role="img" aria-label={fragment.drawing?.altText ?? "Drawing preview unavailable"} style={drawingStyle(fragment, line.x, line.y)}></div>
                  {:else if fragment.hyperlink === undefined}
                    <span
                      data-paragraph={line.paragraphElementId}
                      data-start={fragment.startOffset}
                      data-end={fragment.endOffset}
                      style={inlineFragmentStyle(line, fragmentIndex)}
                    >{fragment.text}</span>
                  {:else}
                    <button
                      class="hyperlink"
                      onkeydown={(event) => activateHyperlink(event, fragment.hyperlink)}
                      onclick={(event) => activateHyperlink(event, fragment.hyperlink)}
                      data-paragraph={line.paragraphElementId}
                      data-start={fragment.startOffset}
                      data-end={fragment.endOffset}
                      style={inlineFragmentStyle(line, fragmentIndex)}
                    >{fragment.text}</button>
                  {/if}
                {/each}
              </div>
              {#if line.fragments.length === 0 || line.fragments.at(-1)?.endOffset !== line.endOffset}
                <span
                  class="caret-anchor"
                  class:empty-line={line.fragments.length === 0}
                  data-paragraph={line.paragraphElementId}
                  data-start={line.fragments.at(-1)?.endOffset ?? line.startOffset}
                  data-end={line.endOffset}
                  style={`left:${wordPointsToCssPixels(line.x + line.width)}px;top:${wordPointsToCssPixels(line.y)}px;width:1px;height:${wordPointsToCssPixels(line.height)}px;line-height:${wordPointsToCssPixels(line.height)}px`}
                >{paragraphText.get(line.paragraphElementId)?.slice(line.fragments.at(-1)?.endOffset ?? line.startOffset, line.endOffset) || "\u200b"}</span>
              {/if}
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .word-scroller { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; touch-action: pan-x pan-y; background: var(--tumbler-document-workspace, #e7e8ea); color: #000; }
  .word-surface { position: relative; min-width: 100%; }
  .word-page { position: absolute; overflow: hidden; box-sizing: border-box; background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 0.2); contain: strict; }
  .word-page-content { position: absolute; inset: 0 auto auto 0; overflow: hidden; }
  .word-page-content.editable { outline: 0; caret-color: var(--tumbler-document-accent, #25a735); }
  .caret-anchor { overflow: visible; }
  .document-drawing { position: absolute; display: block; object-fit: contain; overflow: hidden; }
  .drawing-fallback { background: repeating-linear-gradient(135deg, #f3f3f3, #f3f3f3 8px, #fafafa 8px, #fafafa 16px); border: 1px solid #d0d0d0; }
  .note-separator { position: absolute; width: 96px; border-top: 1px solid #777; }
  .text-line { position: absolute; white-space: pre; font-size: 0; line-height: 0; }
  .text-line > span, .text-line > button { position: relative; display: inline; vertical-align: top; }
  span, button { position: absolute; display: block; box-sizing: border-box; white-space: pre; user-select: text; -webkit-user-select: text; }
  button { margin: 0; border: 0; padding: 0; text-align: inherit; }
  .hyperlink { cursor: pointer; text-decoration: underline; text-decoration-color: currentColor; }
  .hyperlink:focus-visible { outline: 2px solid var(--tumbler-document-accent, #42ff53); outline-offset: 1px; }
</style>
