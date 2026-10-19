import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWordArtifact, openWordArtifact, importWordContent } from "@tumblerjs/word";
import { runTumbler } from "../src/index.ts";
import { createFileHost } from "../src/file-host.ts";

const host = createFileHost();
async function run(args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await runTumbler(args, {
    host,
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  });
  return { code, stdout, stderr };
}
test("real DOCX formatting, replacement, stale handles and preservation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tumbler-cli-"));
  const path = join(directory, "document.docx");
  try {
    writeFileSync(
      path,
      createWordArtifact({
        paragraphs: [
          { runs: [{ text: "the draft report", format: { italic: true } }] },
          { runs: [{ text: "untouched" }] },
        ],
      }).bytes(),
    );
    const read = JSON.parse((await run([path, "read"])).stdout);
    const formatted = await run([
      path,
      "format",
      "--page",
      read.page,
      "--find",
      "draft",
      "--strike",
    ]);
    expect(formatted.code).toBe(0);
    const blocks = importWordContent(openWordArtifact(readFileSync(path)));
    expect(blocks[0]?.kind).toBe("paragraph");
    if (blocks[0]?.kind !== "paragraph") throw new Error("Expected paragraph");
    expect(blocks[0].runs.find((run) => run.text === "draft")?.format).toMatchObject({
      strike: true,
      italic: true,
    });
    const staleBytes = readFileSync(path);
    expect(
      (await run([path, "replace", "--page", read.page, "--find", "draft", "--value", "final"]))
        .stderr,
    ).toContain("changed");
    expect(readFileSync(path)).toEqual(staleBytes);
    const fresh = JSON.parse(formatted.stdout).page;
    const replaced = await run([
      path,
      "replace",
      "--page",
      fresh.page,
      "--find",
      "draft",
      "--value",
      "final",
    ]);
    expect(replaced.code).toBe(0);
    expect(JSON.parse(replaced.stdout).page.text).toBe("the final report\nuntouched\n");
    const cleared = await run([
      path,
      "format",
      "--page",
      JSON.parse(replaced.stdout).page.page,
      "--find",
      "final",
      "--strike=null",
      "--font-size",
      "900",
    ]);
    expect(cleared.code).toBe(0);
    const formattedRun = JSON.parse(cleared.stdout).page.runs.find(
      (run: { text: string }) => run.text === "final",
    );
    expect(formattedRun.attributes).toMatchObject({
      strike: false,
      italic: true,
      fontSize: 900,
    });
    expect((await run([path, "format", "--find", "final", "--strike"])).stderr).toContain(
      "Read first",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("ambiguous targets, unknown flags, mixed selectors and existing creation never write", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tumbler-cli-"));
  const path = join(directory, "document.docx");
  try {
    writeFileSync(
      path,
      createWordArtifact({ paragraphs: [{ runs: [{ text: "draft and draft" }] }] }).bytes(),
    );
    const original = readFileSync(path);
    const read = JSON.parse((await run([path, "read"])).stdout);
    for (const args of [
      [path, "format", "--page", read.page, "--find", "draft", "--strike"],
      [path, "format", "--page", read.page, "--find", "draft", "--strkie"],
      [path, "format", "--page", read.page, "--find", "draft", "--start", "0", "--strike"],
      ["create", path],
    ]) {
      expect((await run(args)).code).toBe(1);
      expect(readFileSync(path)).toEqual(original);
    }
    expect(
      (
        await run([
          path,
          "format",
          "--page",
          read.page,
          "--find",
          "draft",
          "--within",
          "and draft",
          "--strike=false",
        ])
      ).code,
    ).toBe(0);
    expect((await run(["create", join(directory, "new.docx")])).code).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("structured operations execute through the real file host and reject invalid inputs atomically", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tumbler-operations-"));
  const path = join(directory, "report.docx");
  try {
    writeFileSync(
      path,
      createWordArtifact({ paragraphs: [{ runs: [{ text: "Report" }] }] }).bytes(),
    );
    const page = JSON.parse((await run([path, "read"])).stdout).page;
    const styled = await run([
      path,
      "style",
      "--page",
      page,
      "--target",
      JSON.stringify({ text: "Report" }),
      "--input",
      JSON.stringify({ styleId: "Heading1" }),
    ]);
    expect(styled.stderr).toBe("");
    expect(styled.code).toBe(0);
    expect(importWordContent(openWordArtifact(readFileSync(path)))[0]).toMatchObject({
      styleId: "Heading1",
    });
    const before = readFileSync(path);
    const invalid = await run([
      path,
      "list",
      "--page",
      JSON.parse(styled.stdout).page.page,
      "--target",
      JSON.stringify({ text: "Report" }),
      "--input",
      JSON.stringify({ kind: "invented" }),
    ]);
    expect(invalid.code).toBe(1);
    expect(readFileSync(path)).toEqual(before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("file hosts inspect regions and edit a header without modifying body text", async () => {
  const { createWordStory } = await import("@tumblerjs/word");
  const directory = mkdtempSync(join(tmpdir(), "tumbler-story-")),
    path = join(directory, "story.docx");
  try {
    const { artifact, partName } = createWordStory(
      createWordArtifact({ paragraphs: [{ runs: [{ text: "Body unchanged" }] }] }),
      { kind: "header", type: "default", section: 0 },
    );
    writeFileSync(path, artifact.bytes());
    const regions = await run([path, "inspect", "--input", '{"what":"regions"}']);
    expect(regions.code).toBe(0);
    expect(regions.stdout).toContain(partName);
    const read = await run([path, "read", "--region", partName]);
    expect(read.code).toBe(0);
    const result = await run([
      path,
      "page-number",
      "--page",
      JSON.parse(read.stdout).page,
      "--target",
      '{"kind":"range","start":0,"end":0}',
      "--input",
      '{"preset":"page-x-of-y"}',
    ]);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse((await run([path, "read"])).stdout).text).toBe("Body unchanged\n");
    expect(JSON.parse(result.stdout).page.region).toBe(partName);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reading a new header stages it without writing until the first accepted edit", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tumbler-new-story-")),
    path = join(directory, "story.docx");
  try {
    writeFileSync(path, createWordArtifact().bytes());
    const before = readFileSync(path);
    const read = await run([path, "read", "--region", "header:0:default"]);
    expect(read.code).toBe(0);
    expect(readFileSync(path)).toEqual(before);
    const result = await run([
      path,
      "page-number",
      "--page",
      JSON.parse(read.stdout).page,
      "--target",
      '{"kind":"range","start":0,"end":0}',
      "--input",
      '{"preset":"plain"}',
    ]);
    expect(result.stderr).toBe("");
    expect(openWordArtifact(readFileSync(path)).document.headerFooters).toHaveLength(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("every advertised Word operation is dispatched by the CLI without a dedicated host method", async () => {
  const { wordOperations } = await import("@tumblerjs/word/operations");
  const calls: string[] = [];
  for (const operation of Object.values(wordOperations)) {
    let error = "";
    const code = await runTumbler(
      [
        "document",
        operation.name,
        "--target",
        '{"kind":"range","start":0,"end":1}',
        "--input",
        JSON.stringify(operation.example),
      ],
      {
        host: {
          ...host,
          async operate(_document, input) {
            calls.push(input.operation.name);
            return { ok: true };
          },
        },
        stdout: () => {},
        stderr: (value) => (error += value),
      },
    );
    expect(error).toBe("");
    expect(code).toBe(0);
  }
  expect(calls).toEqual(Object.keys(wordOperations));
});
