import { expect, test } from 'bun:test';
import { openPdfDocument, mergePdfDocuments, PdfInterpreter } from '@tumblerjs/pdf';
import { refreshMergeSources, mergeSourceSelection, type PdfMergeSource } from '../src/pdf/merge-source.ts';

const bytes = await Bun.file(new URL('../../pdf/test/fixtures/basic-text.pdf', import.meta.url)).bytes();
function source(id: number, read: PdfMergeSource['read']): PdfMergeSource {
  return { id, name: 'Source.pdf', bytes, document: openPdfDocument(bytes), read, password: '', pages: '', none: false, loading: false, error: '', locked: false };
}
test('merge refreshes hosted reads without resetting order, duplicates or page choices', async () => {
  let reads = 0;
  const document = openPdfDocument(bytes);
  const first = source(1, async () => { reads++; return document; });
  first.pages = '1,1';
  const second = source(2, async () => { reads++; return bytes; });
  const blocks = [second, first];
  await refreshMergeSources(blocks, new AbortController().signal);
  expect(reads).toBe(2);
  expect(blocks.map(block => block.id)).toEqual([2, 1]);
  expect(first.pages).toBe('1,1');
  expect(first.document).toBe(document);
  await refreshMergeSources(blocks, new AbortController().signal);
  expect(reads).toBe(4);
  expect(mergeSourceSelection(first).pages).toEqual([0, 0]);
});
test('authenticated documents merge without asking for their password again', async () => {
  const encrypted = openPdfDocument(await Bun.file(new URL('../../pdf/test/fixtures/encrypted-aes256.pdf', import.meta.url)).bytes(), {password:'fixture-password'});
  const block = source(1, async () => encrypted);
  await refreshMergeSources([block], new AbortController().signal);
  const merged = openPdfDocument(mergePdfDocuments([{document:block.document!,pages:[0]}]));
  expect(merged.source.encrypted).toBe(false);
  expect(new PdfInterpreter(merged).page(0).text).toBe(new PdfInterpreter(encrypted).page(0).text);
});
test('refresh failures and obsolete page ranges stop creation', async () => {
  const block = source(1, async () => { throw new Error('Offline'); });
  await expect(refreshMergeSources([block], new AbortController().signal)).rejects.toThrow('Offline');
  block.read = async () => bytes;
  block.pages = '999';
  await expect(refreshMergeSources([block], new AbortController().signal)).rejects.toThrow();
});

test('workspace reads use the latest downloaded bytes when creating the merge', async () => {
  let current = bytes;
  const block = source(1, async () => current);
  await refreshMergeSources([block], new AbortController().signal);
  const original = new PdfInterpreter(block.document!).page(0).text;
  current = await Bun.file(new URL('../../pdf/test/fixtures/positioned-text.pdf', import.meta.url)).bytes();
  await refreshMergeSources([block], new AbortController().signal);
  const output = openPdfDocument(mergePdfDocuments([{document:block.document!,pages:[0]}]));
  expect(new PdfInterpreter(output).page(0).text).not.toBe(original);
});
