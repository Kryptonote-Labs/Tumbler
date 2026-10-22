import { afterEach, expect, test } from 'bun:test';
import { WordImageUrls } from '../src/word-image-urls.ts';

const owners: WordImageUrls[] = [];
afterEach(() => { for (const owner of owners.splice(0)) owner.destroy(); });
function owner() { const value = new WordImageUrls(); owners.push(value); return value; }
const image = (bytes = new Uint8Array([1, 2, 3]), contentType = 'image/png') => ({ elementId: 1, bytes, contentType });

test('120 artifact replacements reuse equal bytes and retain a readable blob', async () => {
  const urls = owner();
  const url = urls.get(image());
  for (let index = 0; index < 120; index++) {
    expect(urls.get(image())).toBe(url);
    urls.retain(new Set([url]));
  }
  expect(new Uint8Array(await (await fetch(url)).arrayBuffer())).toEqual(image().bytes);
  urls.destroy();
  await expect(fetch(url)).rejects.toThrow();
});

test('changed bytes and MIME types get distinct URLs, released only after their DOM references disappear', async () => {
  const urls = owner();
  const old = urls.get(image());
  const changed = urls.get(image(new Uint8Array([1, 2, 4])));
  const mime = urls.get(image(new Uint8Array([1, 2, 4]), 'image/jpeg'));
  expect(new Set([old, changed, mime]).size).toBe(3);
  urls.retain(new Set([old, changed, mime]));
  expect((await fetch(old)).ok).toBe(true);
  urls.retain(new Set([mime]));
  await expect(fetch(old)).rejects.toThrow();
  await expect(fetch(changed)).rejects.toThrow();
  expect((await fetch(mime)).headers.get('content-type')).toBe('image/jpeg');
  expect(urls.get(image(new Uint8Array([1, 2, 4]), 'image/jpeg'))).toBe(mime);
});

test('document swaps, empty viewports and remounts release old blobs without evicting current ones', async () => {
  const urls = owner();
  let previous: string | undefined;
  for (let index = 0; index < 120; index++) {
    const current = urls.get(image(new Uint8Array([index])));
    urls.retain(new Set([current]));
    if (previous) await expect(fetch(previous)).rejects.toThrow();
    expect(new Uint8Array(await (await fetch(current)).arrayBuffer())).toEqual(new Uint8Array([index]));
    previous = current;
  }
  urls.retain(new Set());
  await expect(fetch(previous!)).rejects.toThrow();
  const remounted = urls.get(image(new Uint8Array([119])));
  expect(remounted).not.toBe(previous);
  expect((await fetch(remounted)).ok).toBe(true);
});
