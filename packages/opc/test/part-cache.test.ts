import { expect, test } from "bun:test";
import { PartCache } from "../src/part-cache.ts";

test("part reads reuse verified bytes without sharing mutable buffers", () => {
  const cache = new PartCache(4);
  let loads = 0;
  const load = () => { loads += 1; return new Uint8Array([1, 2]); };
  const first = cache.read("image", load);
  first[0] = 99;
  const second = cache.read("image", load);
  expect(second).toEqual(new Uint8Array([1, 2]));
  expect(second).not.toBe(first);
  expect(loads).toBe(1);
  cache.clear();
  cache.read("image", load);
  expect(loads).toBe(2);
});

test("part bytes evict least recently used entries within the byte budget", () => {
  const cache = new PartCache(4);
  const loads: string[] = [];
  const read = (key: string) => cache.read(key, () => {
    loads.push(key);
    return new Uint8Array(2);
  });
  read("a"); read("b"); read("a"); read("c"); read("a"); read("b");
  expect(loads).toEqual(["a", "b", "c", "b"]);
});

test("oversized entries and disabled caches retain no part bytes", () => {
  for (const budget of [0, 1]) {
    const cache = new PartCache(budget);
    let loads = 0;
    const load = () => { loads += 1; return new Uint8Array(2); };
    cache.read("image", load);
    cache.read("image", load);
    expect(loads).toBe(2);
  }
});
