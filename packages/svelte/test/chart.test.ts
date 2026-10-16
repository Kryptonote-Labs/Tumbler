import { expect, test } from "bun:test";
import { compile } from "svelte/compiler";

test("the SVG chart head compiles cleanly and stays inert to worksheet pointer selection", async () => {
  const source = await Bun.file(new URL("../src/OoxmlChart.svelte", import.meta.url)).text();
  const result = compile(source, { filename: "OoxmlChart.svelte", generate: "client", modernAst: true });
  expect(result.warnings).toEqual([]);
  expect(result.css?.code).toMatch(/\.chart[^}]*pointer-events: none/);
});
