import { describe, expect, test } from "bun:test";
import { compile } from "svelte/compiler";

describe("owned Svelte chart head", () => {
  test("compiles native SVG charts without external rendering libraries", async () => {
    const source = await Bun.file(new URL("../src/OoxmlChart.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "OoxmlChart.svelte", generate: "client", modernAst: true });
    expect(result.warnings).toEqual([]);
    expect(result.js.code).toContain("Chart preview unavailable");
    expect(source).toContain("<svg");
    expect(source).toContain("pieArcPath");
    expect(source).toContain("layoutScatterChart");
    expect(source).toContain("scatterLinePath");
    expect(source).not.toMatch(/chart\.js|highcharts|plotly|echarts/i);
  });

  test("renders numeric scatter axes, clipped series, and authored marker variants", async () => {
    const source = await Bun.file(new URL("../src/OoxmlChart.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "OoxmlChart.svelte", generate: "client", modernAst: true });
    expect(result.warnings).toEqual([]);
    expect(source).toContain('model.kind === "scatter"');
    expect(source).toContain("clip-path");
    expect(source).toContain('symbol === "diamond"');
    expect(source).toContain("formatNumber");
  });

  test("keeps chart text accessible and SVG inert to worksheet pointer selection", async () => {
    const source = await Bun.file(new URL("../src/OoxmlChart.svelte", import.meta.url)).text();
    const result = compile(source, { filename: "OoxmlChart.svelte", generate: "client", modernAst: true });
    expect(result.css?.code).toMatch(/\.chart[^}]*pointer-events: none/);
    expect(source).toContain('role="img"');
    expect(source).toContain("<title>{accessibleName}</title>");
  });
});
