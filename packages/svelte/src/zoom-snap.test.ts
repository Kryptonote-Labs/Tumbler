import { describe, expect, test } from "bun:test";
import { snappedZoom, type SnappedZoom } from "./zoom-snap.ts";

const zoomed = (start: number, factor: number, steps: number) => {
  let level: SnappedZoom = { raw: start, scale: start };
  for (let step = 0; step < steps; step += 1)
    level = snappedZoom(level, level.scale, factor);
  return level.scale;
};

describe("snappedZoom", () => {
  test("rests on 100% when a gesture lands nearby", () => {
    expect(zoomed(0.9, 1.01, 8)).toBe(1);
    expect(zoomed(1.1, 0.99, 8)).toBe(1);
  });

  test("small steps can still leave 100%", () => {
    expect(zoomed(1, 1.01, 8)).toBeGreaterThan(1.05);
  });

  test("restarts from a zoom set outside the gesture", () => {
    const level = snappedZoom({ raw: 1.04, scale: 1 }, 2, 1.1);
    expect(level.scale).toBeCloseTo(2.2);
  });

  test("stays within the zoom range", () => {
    expect(zoomed(2.9, 1.5, 1)).toBe(3);
    expect(zoomed(0.3, 0.5, 1)).toBe(0.25);
  });
});
