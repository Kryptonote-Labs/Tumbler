import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTumbler } from "../src/index.ts";
import { createFileHost } from "../src/file-host.ts";
test("presentation CLI creates, reads, edits and rejects stale file handles", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tumbler-slides-cli-"));
  try {
    const path = join(dir, "deck.pptx"),
      host = createFileHost();
    let stdout = "",
      stderr = "";
    const execute = async (args: string[]) => {
      stdout = "";
      stderr = "";
      return runTumbler(args, { host, stdout: (s) => (stdout += s), stderr: (s) => (stderr += s) });
    };
    expect(await execute(["create", path])).toBe(0);
    expect(await execute([path, "slides", "read"])).toBe(0);
    const read = JSON.parse(stdout),
      page = read.page,
      slideId = read.slide.id;
    expect(
      await execute([
        path,
        "slides",
        "insert-object",
        "--page",
        page,
        "--input",
        JSON.stringify({
          slideId,
          bounds: { x: 10, y: 20, width: 300, height: 100 },
          object: { kind: "shape", text: "CLI authoring" },
        }),
      ]),
    ).toBe(0);
    expect(JSON.parse(stdout).slide.objects[0].text).toBe("CLI authoring");
    expect(
      await execute([
        path,
        "slides",
        "delete-slide",
        "--page",
        page,
        "--input",
        JSON.stringify({ slideId }),
      ]),
    ).toBe(1);
    expect(stderr).toContain("changed");
    const before = await Bun.file(path).bytes();
    expect(await execute([path, "slides", "insert-object", "--help"])).toBe(0);
    expect(stdout).toContain("bounds");
    expect(await Bun.file(path).bytes()).toEqual(before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("presentation read help works without opening a document", async () => {
  let stdout = "";
  expect(
    await runTumbler(["missing.pptx", "slides", "read", "--help"], {
      host: createFileHost(),
      stdout: (s) => (stdout += s),
      stderr: () => {},
    }),
  ).toBe(0);
  expect(stdout).toContain("--slide");
});
test("presentation edits through symlinks retain the alias and update its target", async () => {
  const { symlink, lstat } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "tumbler-slides-alias-"));
  try {
    const target = join(dir, "target.pptx"),
      alias = join(dir, "alias.pptx"),
      host = createFileHost();
    await host.create(target);
    await symlink(target, alias);
    const read = (await host.readPresentation!(alias)) as { page: string; slide: { id: string } };
    await host.operatePresentation!(alias, {
      page: read.page,
      command: {
        name: "insert-object",
        slideId: read.slide.id,
        bounds: { x: 10, y: 10, width: 100, height: 100 },
        object: { kind: "shape", text: "Through alias" },
      },
    });
    expect((await lstat(alias)).isSymbolicLink()).toBe(true);
    expect(await Bun.file(alias).bytes()).toEqual(await Bun.file(target).bytes());
    expect(await host.readPresentation!(target)).toMatchObject({
      slide: { objects: [{ text: "Through alias" }] },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
