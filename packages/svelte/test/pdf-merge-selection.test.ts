import { expect, test } from "bun:test";
import {
  mergePageSelection,
  mergePageRanges,
  toggleMergePage,
} from "../src/pdf/merge-selection.ts";

test("range input preserves custom order and repeated pages while distinguishing none from all", () => {
  expect(mergePageSelection("", 4)).toMatchObject({
    pages: [0, 1, 2, 3],
    custom: false,
    error: "",
  });
  expect(mergePageSelection("", 4, true).pages).toEqual([]);
  expect(mergePageSelection("3,1-2,3", 4)).toMatchObject({ pages: [2, 0, 1, 2], custom: true });
  expect(mergePageSelection("2,4", 4)).toMatchObject({ pages: [1, 3], custom: false });
  for (const range of ["0", "5", "1-", "garbage"])
    expect(mergePageSelection(range, 4).error).not.toBe("");
});

test("checkbox and shift selection produce editable compact ranges", () => {
  expect(toggleMergePage([0, 1, 2, 3], 1)).toEqual([0, 2, 3]);
  expect(toggleMergePage([0], 3, 1)).toEqual([0, 1, 2, 3]);
  const pages = toggleMergePage([], 2);
  expect(mergePageRanges(pages)).toBe("3");
  expect(mergePageRanges([0, 1, 2, 4, 6, 7])).toBe("1-3,5,7-8");
  expect(mergePageSelection(mergePageRanges(pages), 4).pages).toEqual(pages);
});


test('locked sources retain their password prompt until authentication succeeds', async () => {
  const { openMergeSource, mergeSourceSummary, createPdfMergeState } = await import('../src/pdf/merge-source.ts');
  const bytes = new Uint8Array(await Bun.file(new URL('../../pdf/test/fixtures/encrypted-aes256.pdf', import.meta.url)).arrayBuffer());
  const source = { id: 0, name: 'Locked.pdf', bytes, pages: '', password: '', none: false, loading: false, locked: false, error: '' };
  openMergeSource(source);
  expect(source.locked).toBe(true);
  expect(mergeSourceSummary(source)).toBe('Password required');
  source.password = 'wrong';
  openMergeSource(source);
  expect(source.locked).toBe(true);
  source.password = 'fixture-password';
  openMergeSource(source);
  expect(source.locked).toBe(false);
  expect(source.error).toBe('');
  expect(mergeSourceSummary(source)).toStartWith('All ');
  const first = createPdfMergeState(), second = createPdfMergeState();
  first.blocks.push(source);
  first.filename = 'Mine.pdf';
  expect(second.blocks).toEqual([]);
  expect(second.filename).toBe('');
});


test('an incomplete range preserves the last valid preview and blocks merging', async () => {
  const { mergeSourceSelection, mergeSourceSummary, openMergeSource } = await import('../src/pdf/merge-source.ts');
  const state = (await import('../src/pdf/merge-source.ts')).createPdfMergeState();
  state.blocks.push({ id: 0, name: 'Pages.pdf', bytes: new Uint8Array(await Bun.file(new URL('../../pdf/test/fixtures/page-sequence.pdf', import.meta.url)).arrayBuffer()), pages: '', none: false, password: '', loading: false, locked: false, error: '' });
  const source = state.blocks[0]!;
  openMergeSource(source);
  const before = mergeSourceSelection(source).pages;
  source.draft = '2-';
  expect(mergeSourceSelection(source).pages).toEqual(before);
  expect(mergeSourceSelection(source).error).not.toBe('');
  expect(mergeSourceSummary(source)).not.toBe('Check page selection');
  source.rangeErrorVisible = true;
  expect(mergeSourceSummary(source)).toBe('Check page selection');
  source.pages = '2,1,1';
  source.draft = undefined;
  expect(mergeSourceSelection(source)).toMatchObject({ pages: [1, 0, 0], custom: true, error: '' });
});
