import { wordPointsToCssPixels, type WordDocument, type WordLayout } from "@tumblerjs/word";
import { calculateWordPageViewport, type WordPageViewport } from "./word-page-viewport.ts";

export type WordFitMode = "width" | "page";

/** Page dimensions and offsets are unscaled CSS pixels. Page indexes are zero-based. */
export interface WordViewLayout {
  readonly document: WordDocument;
  /** Whether page count and total dimensions describe a completed layout. */
  readonly complete: boolean;
  readonly pages: readonly Readonly<{ index: number; top: number; width: number; height: number }>[];
  readonly totalWidth: number;
  readonly totalHeight: number;
}

export interface WordViewViewport {
  readonly document: WordDocument;
  readonly scale: number;
  /** Scroller dimensions and scroll positions are scaled CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  /** First page ending below the viewport top; last page when scrolled past the end. */
  readonly currentPage: number | undefined;
  /** Pages intersecting the viewport, excluding virtualization overscan. */
  readonly firstVisiblePage: number | undefined;
  readonly lastVisiblePage: number | undefined;
}

export interface WordViewHandle {
  /** Retain this fit mode across resizes/reflow until scale changes externally. */
  fit(mode: WordFitMode): boolean;
  /** Scroll after pending DOM updates. False for unavailable or invalid pages. */
  scrollToPage(index: number): Promise<boolean>;
}

interface ScrollArea {
  readonly clientWidth: number;
  readonly clientHeight: number;
  scrollTop: number;
  scrollLeft: number;
}

/** Owns host navigation state; pagination and virtualization stay in the viewer. */
export class WordViewState {
  #document: WordDocument | undefined;
  #layout: WordLayout | undefined;
  #fit: WordFitMode | undefined;
  #scale: number | undefined;
  layout: WordViewLayout | undefined;

  fit(mode: WordFitMode) {
    this.#fit = mode;
  }

  update(document: WordDocument, layout: WordLayout, area: ScrollArea, scale: number, complete = true, preserveScroll = false) {
    if (this.#scale !== undefined && scale !== this.#scale) this.#fit = undefined;
    if (document !== this.#document) {
      this.#document = document;
      if (!preserveScroll) {
        area.scrollTop = 0;
        area.scrollLeft = 0;
      }
    }
    if (layout !== this.#layout || this.layout?.document !== document || this.layout?.complete !== complete) {
      this.#layout = layout;
      const geometry = calculateWordPageViewport(layout, 0, 0);
      this.layout = Object.freeze({
        document, complete,
        pages: Object.freeze(layout.pages.map((page, index) => Object.freeze({
          index: page.index,
          top: geometry.offsets[index]!,
          width: wordPointsToCssPixels(page.width),
          height: wordPointsToCssPixels(page.height),
        }))),
        totalWidth: geometry.totalWidth,
        totalHeight: geometry.totalHeight,
      });
    }
    const pages = this.layout!.pages;
    if (this.#fit && pages.length && area.clientWidth > 0 && area.clientHeight > 0) {
      const width = pages.reduce((max, page) => Math.max(max, page.width), 0) + 48;
      const height = pages.reduce((max, page) => Math.max(max, page.height), 0) + 48;
      scale = Math.max(0.25, Math.min(3, this.#fit === "width"
        ? area.clientWidth / width
        : Math.min(area.clientWidth / width, area.clientHeight / height)));
    }
    this.#scale = scale;
    const viewport = calculateWordPageViewport(layout, Math.max(0, area.scrollTop) / scale, area.clientHeight / scale);
    const top = Math.max(0, area.scrollTop) / scale;
    const bottom = top + area.clientHeight / scale;
    const visible = pages.filter((page, index) =>
      viewport.offsets[index]! < bottom && viewport.offsets[index]! + page.height > top);
    const snapshot: WordViewViewport = Object.freeze({
      document, scale, width: area.clientWidth, height: area.clientHeight,
      scrollTop: area.scrollTop, scrollLeft: area.scrollLeft,
      currentPage: pages.find((page, index) => viewport.offsets[index]! + page.height > top)?.index ?? pages.at(-1)?.index,
      firstVisiblePage: visible[0]?.index,
      lastVisiblePage: visible.at(-1)?.index,
    });
    return { scale, viewport, snapshot };
  }

  scrollToPage(index: number, viewport: WordPageViewport, area: ScrollArea, scale: number) {
    if (!Number.isInteger(index) || index < 0 || index >= viewport.offsets.length) return false;
    area.scrollTop = viewport.offsets[index]! * scale;
    return true;
  }
}
