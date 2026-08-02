import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { SparseAxisGeometry } from "../src/index.ts";

describe("sparse axis geometry", () => {
  test("indexes custom and hidden items without materializing the axis", () => {
    const axis = new SparseAxisGeometry(1_048_576, 20, [
      { index: 2, size: 40 },
      { index: 4, size: 0 },
      { index: 1_048_576, size: 30 },
    ]);
    expect(axis.start(1)).toBe(0);
    expect(axis.start(2)).toBe(20);
    expect(axis.start(3)).toBe(60);
    expect(axis.start(5)).toBe(80);
    expect(axis.indexAt(79)).toBe(3);
    expect(axis.indexAt(80)).toBe(5);
    expect(axis.overrides).toHaveLength(3);
    expect(axis.totalSize).toBe(20_971_530);
  });

  test("matches a materialized generated axis", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 200 }),
      fc.integer({ min: 1, max: 50 }),
      fc.array(fc.tuple(fc.integer({ min: 1, max: 200 }), fc.integer({ min: 0, max: 80 })), { maxLength: 80 }),
      (count, defaultSize, rawOverrides) => {
        const applicable = rawOverrides.filter(([index]) => index <= count).map(([index, size]) => ({ index, size }));
        const axis = new SparseAxisGeometry(count, defaultSize, applicable);
        const byIndex = new Map(applicable.map(({ index, size }) => [index, size]));
        const materialized = Array.from({ length: count }, (_, zeroBased) => byIndex.get(zeroBased + 1) ?? defaultSize);
        expect(axis.totalSize).toBe(materialized.reduce((sum, size) => sum + size, 0));
        let start = 0;
        for (let index = 1; index <= count; index += 1) {
          expect(axis.start(index)).toBe(start);
          expect(axis.size(index)).toBe(materialized[index - 1]!);
          start += materialized[index - 1]!;
        }
      },
    ), { numRuns: 1_000 });
  });
});
