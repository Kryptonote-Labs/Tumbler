import { expect, test } from "bun:test";
import { createWordArtifact, type WordLayout } from "@tumblerjs/word";
import { WordViewState } from "../src/word-view-state.ts";

const document = createWordArtifact({ paragraphs: [{ runs: [{ text: "Page" }] }] }).document;
function layout(sizes = [[600, 750], [750, 600]]): WordLayout {
  return {
    fragmentCount: 0,
    pages: sizes.map(([width = 600, height = 750], index) => ({
      index, width, height, section: {} as never, columns: [],
      headerLines: [], footerLines: [], headerTables: [], footerTables: [],
      noteLines: [], noteTables: [], noteSeparatorY: undefined,
    })),
  };
}
const area = () => ({ clientWidth: 1048, clientHeight: 1048, scrollTop: 0, scrollLeft: 0 });

test("snapshots expose mixed page dimensions and visible pages without overscan", () => {
  const state = new WordViewState();
  const host = area();
  const pages = layout();
  const initial = state.update(document, pages, host, 1);
  expect(state.layout?.pages.map(page => [page.width, page.height])).toEqual([[800, 1000], [1000, 800]]);
  expect(state.layout?.totalHeight).toBe(1872);
  host.scrollTop = 1100;
  host.clientHeight = 300;
  const next = state.update(document, pages, host, 1);
  expect(next.snapshot).toMatchObject({ currentPage: 1, firstVisiblePage: 1, lastVisiblePage: 1, height: 300, scrollTop: 1100 });
  expect(next.viewport.first).toBe(0);
  expect(initial.snapshot.scrollTop).toBe(0);
  expect(Object.isFrozen(next.snapshot)).toBe(true);
  expect(Object.isFrozen(state.layout?.pages[0])).toBe(true);
});

test("fit survives resizing and reflow, and manual scale releases it", () => {
  const state = new WordViewState();
  const host = area();
  const pages = layout();
  state.update(document, pages, host, 1);
  state.fit("width");
  expect(state.update(document, pages, host, 1).scale).toBe(1);
  host.clientWidth = 524;
  expect(state.update(document, pages, host, 1).scale).toBe(0.5);
  expect(state.update(document, layout([[300, 750]]), host, 0.5).scale).toBeCloseTo(524 / 448);
  expect(state.update(document, pages, host, 1.5).scale).toBe(1.5);
  host.clientWidth = 1048;
  expect(state.update(document, pages, host, 1.5).scale).toBe(1.5);
});

test("page fit uses both axes and navigation uses unmounted page offsets", () => {
  const state = new WordViewState();
  const host = area();
  host.clientHeight = 524;
  state.fit("page");
  const next = state.update(document, layout(), host, 1);
  expect(next.scale).toBe(0.5);
  expect(state.scrollToPage(1, next.viewport, host, next.scale)).toBe(true);
  expect(host.scrollTop).toBe(524);
  for (const index of [-1, 2, 1.5, NaN]) {
    expect(state.scrollToPage(index, next.viewport, host, next.scale)).toBe(false);
    expect(host.scrollTop).toBe(524);
  }
});

test("document replacement resets navigation, retains fit, and identifies new snapshots", () => {
  const state = new WordViewState();
  const host = area();
  const pages = layout();
  state.fit("width");
  state.update(document, pages, host, 1);
  host.scrollTop = 1000;
  host.scrollLeft = 50;
  const replacement = createWordArtifact({ paragraphs: [{ runs: [{ text: "Replacement" }] }] }).document;
  const next = state.update(replacement, pages, host, 1);
  expect(next.snapshot).toMatchObject({ document: replacement, scrollTop: 0, scrollLeft: 0, currentPage: 0 });
  expect(state.layout?.document).toBe(replacement);
  host.clientWidth = 524;
  expect(state.update(replacement, pages, host, 1).scale).toBe(0.5);
});

test("empty layouts and zero-sized hosts remain finite", () => {
  const state = new WordViewState();
  const host = area();
  host.clientWidth = host.clientHeight = 0;
  state.fit("page");
  const next = state.update(document, layout([]), host, 1);
  expect(next.scale).toBe(1);
  expect(next.snapshot.currentPage).toBeUndefined();
  expect(state.scrollToPage(0, next.viewport, host, 1)).toBe(false);
});

test("provisional counts are distinguishable when cooperative snapshots are integrated", () => {
  const state = new WordViewState();
  const host = area();
  const pages = layout();
  state.update(document, pages, host, 1, false);
  const provisional = state.layout;
  expect(provisional?.complete).toBe(false);
  state.update(document, pages, host, 1, true);
  expect(state.layout?.complete).toBe(true);
  expect(provisional?.complete).toBe(false);
});


test("edited revisions preserve scrolling while read-only file replacement resets it", () => {
  const state = new WordViewState();
  const host = area();
  const pages = layout();
  state.update(document, pages, host, 1);
  host.scrollTop = 1100;
  host.scrollLeft = 100;
  const edited = createWordArtifact({ paragraphs: [{ runs: [{ text: "Edited" }] }] }).document;
  const next = state.update(edited, pages, host, 1, true, true);
  expect(next.snapshot.scrollTop).toBe(1100);
  expect(next.snapshot.scrollLeft).toBe(100);
  expect(next.snapshot.currentPage).toBe(1);
  state.update(document, pages, host, 1);
  expect(host.scrollTop).toBe(0);
  expect(host.scrollLeft).toBe(0);
});
