import { expect, test } from "bun:test";
import { runTumbler, type OperationHost } from "../src/index.ts";

test("replacement flags decode escapes once, with exact literal and file inputs", async () => {
  const values: string[] = [];
  const host: OperationHost = {
    async create() {},
    async read() {},
    async operate(_document, { operation }) {
      if (operation.name !== "replace") throw new Error("Expected replacement");
      values.push(operation.input.value);
      return {};
    },
  };
  const raw = "C:\\new\\test.java\n雪 😀\n";
  const readPaths: string[] = [];
  const run = async (...flags: string[]) => {
    let error = "";
    const code = await runTumbler(["doc", "replace", "--start", "0", "--end", "0", ...flags], {
      host,
      stdout: () => {},
      stderr: (value) => {
        error += value;
      },
      readValue: async (path) => {
        readPaths.push(path);
        return raw;
      },
    });
    return { code, error };
  };
  expect((await run("--value", String.raw`one\ntwo\tthree\r\nend\\n\q`)).code).toBe(0);
  expect(values.pop()).toBe("one\ntwo\tthree\r\nend\\n\\q");
  expect((await run("--value", String.raw`C:\new\test`, "--literal")).code).toBe(0);
  expect(values.pop()).toBe(String.raw`C:\new\test`);
  expect((await run("--value", "one\ntwo\n")).code).toBe(0);
  expect(values.pop()).toBe("one\ntwo\n");
  expect((await run("--value", "")).code).toBe(0);
  expect(values.pop()).toBe("");
  for (const path of ["-", "code.java"]) {
    expect((await run("--value-file", path)).code).toBe(0);
    expect(values.pop()).toBe(raw);
  }
  expect(readPaths).toEqual(["-", "code.java"]);
  for (const flags of [
    ["--value", "a", "--value-file", "-"],
    ["--literal"],
    ["--value-file", "-", "--literal"],
    ["--value", "x", "--literal=maybe"],
  ]) {
    expect((await run(...flags)).code).toBe(1);
  }
  expect(values).toEqual([]);
  expect(
    await runTumbler(
      [
        "doc",
        "replace",
        "--target",
        '{"kind":"range","start":0,"end":0}',
        "--input",
        JSON.stringify({ value: raw }),
      ],
      { host, stdout: () => {}, stderr: () => {} },
    ),
  ).toBe(0);
  expect(values.pop()).toBe(raw);
});

test("the executable reads UTF-8 stdin and real files without decoding their contents", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createFileHost } = await import("../src/file-host.ts");
  const directory = await mkdtemp(join(tmpdir(), "tumbler-value-"));
  try {
    const path = join(directory, "test.docx"),
      file = join(directory, "code.txt");
    const host = createFileHost();
    await host.create(path);
    const value = "雪 😀\nC:\\new\\test\n";
    await writeFile(file, value);
    for (const source of ["-", file]) {
      const current = (await host.read(path, { region: "body", offset: 0 })) as { page: string };
      const child = Bun.spawn(
        [
          process.execPath,
          new URL("../src/bin.ts", import.meta.url).pathname,
          path,
          "replace",
          "--page",
          current.page,
          "--start",
          "0",
          "--end",
          "0",
          "--value-file",
          source,
        ],
        { stdin: source === "-" ? new Blob([value]) : "ignore", stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(stderr).toBe("");
      expect(code).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.page.runs.map((run: { text: string }) => run.text).join("")).toStartWith(value);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
