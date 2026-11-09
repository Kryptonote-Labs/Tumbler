import { expect, test } from "bun:test";
import { runTumbler } from "../src/index.ts";
import { createFileHost } from "../src/file-host.ts";
import { fileURLToPath } from "node:url";
test("PDF find reads files and returns shared results without modifying bytes", async () => {
  const path = fileURLToPath(
    new URL("../../pdf/test/fixtures/page-sequence.pdf", import.meta.url),
  );
  const original = await Bun.file(path).bytes();
  let stdout = "",
    stderr = "";
  const run = (flags: string[]) => {
    stdout = "";
    stderr = "";
    return runTumbler([path, "pdf", ...flags], {
      host: createFileHost(),
      stdout: (s) => (stdout += s),
      stderr: (s) => (stderr += s),
    });
  };
  expect(await run(["find", "page", "--pages", "2-3"])).toBe(0);
  const result = JSON.parse(stdout);
  expect(result.total).toBeGreaterThan(0);
  expect(
    result.matches.every((m: { page: number }) => m.page >= 2 && m.page <= 3),
  ).toBe(true);
  expect(result.matches[0].rects[0].width).toBeGreaterThan(0);
  expect(await run(["find", "page", "--pages", "0-2"])).toBe(1);
  expect(stderr).toContain("Invalid page range");
  expect(await run(["find", "page", "--pages", "999"])).toBe(1);
  expect(await run(["find", "page", "--unknown"])).toBe(1);
  expect(await run(["find", "page", "--match-case", "--match-case"])).toBe(1);
  expect(await run(["find", ""])).toBe(1);
  expect(await run(["--help"])).toBe(0);
  expect(stdout).toContain("pdf find");
  expect(stdout).toContain("pdf delete-pages");
  expect(await run(["find", "--help"])).toBe(0);
  expect(stdout).toContain("--match-case");
  expect(stdout).not.toContain("pdf delete-pages");
  expect(await run(["delete-pages", "--help"])).toBe(0);
  expect(stdout).toContain("pdf delete-pages");
  expect(stdout).not.toContain("pdf find");
  expect(await Bun.file(path).bytes()).toEqual(original);
});
