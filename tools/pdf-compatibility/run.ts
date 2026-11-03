import { renderBrowserPdf } from "./browser-paint.ts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { openPdfDocument } from "../../packages/pdf/src/index.ts";
import { renderNativePdf } from "./native-paint.ts";
import { comparePrecision } from "./precision.ts";

const manifest = z.object({
  fixtures: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      file: z.string().regex(/^[a-z0-9-]+\.pdf$/),
      sha256: z.string(),
      structural: z.enum(["clean", "reject"]),
      password: z.string().optional(),
    }),
  ),
});
const oracleSchema = z.object({
  pdfium: z.string(),
  binding: z.string(),
  pages: z.array(
    z.object({
      width: z.number(),
      height: z.number(),
      text: z.string(),
      objects: z.array(
        z.object({
          kind: z.enum(["path", "image"]),
          bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        }),
      ),
      image: z.string().regex(/^page-\d+\.png$/),
      boxes: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])),
      characters: z.array(
        z.object({
          code: z.number(),
          generated: z.boolean(),
          origin: z.tuple([z.number(), z.number()]),
          fontSize: z.number(),
          matrix: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
        }),
      ),
    }),
  ),
});
async function command(args: string[]) {
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" }),
    timer = setTimeout(() => child.kill(), 120_000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(`${args[0]} failed (${code}): ${stderr}`);
    return stdout;
  } finally {
    clearTimeout(timer);
  }
}
async function main() {
  const [directory, outputDirectory, renderer] = process.argv.slice(2);
  if (renderer !== undefined && renderer !== "--browser")
    throw new Error("Unknown PDF renderer option.");
  if (!directory || !outputDirectory)
    throw new Error("Usage: bun tools/pdf-compatibility/run.ts <corpus> <new-report-directory>");
  const corpus = resolve(directory),
    output = resolve(outputDirectory);
  await mkdir(output);
  const input = manifest.parse(JSON.parse(await readFile(join(corpus, "manifest.json"), "utf8"))),
    results = [];
  let pdfium = "";
  for (const fixture of input.fixtures) {
    const bytes = new Uint8Array(await readFile(join(corpus, fixture.file))),
      failures: string[] = [];
    const pages = [];
    try {
      if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== fixture.sha256)
        throw new Error("Fixture hash does not match its manifest.");
      if (fixture.structural === "reject") {
        let rejected = false;
        try {
          openPdfDocument(bytes);
        } catch {
          rejected = true;
        }
        if (!rejected) throw new Error("Malformed fixture was accepted.");
      } else {
        const folder = join(output, fixture.id);
        await mkdir(folder);
        const oracle = oracleSchema.parse(
          JSON.parse(
            await command([
              process.env.PDF_PYTHON ?? "python3",
              fileURLToPath(new URL("./pdfium-oracle.py", import.meta.url)),
              join(corpus, fixture.file),
              join(folder, "reference"),
              fixture.password ?? "",
            ]),
          ),
        );
        pdfium = oracle.pdfium;
        await writeFile(join(folder, "oracle.json"), JSON.stringify(oracle, null, 2));
        const native = await (renderer === "--browser" ? renderBrowserPdf : renderNativePdf)(
          bytes,
          fixture.password,
        );
        if (native.length !== oracle.pages.length)
          throw new Error("Rendered page count differs from PDFium.");
        for (const [index, page] of native.entries()) {
          const reference = oracle.pages[index]!;
          await writeFile(join(folder, `native-${index + 1}.png`), page.png);
          const result = await comparePrecision(
            page.png,
            await readFile(join(folder, "reference", reference.image)),
            page.scene,
            reference,
          );
          await writeFile(join(folder, `diff-${index + 1}.png`), result.diff);
          const { diff: _, ...metrics } = result;
          pages.push(metrics);
          if (!result.passed)
            failures.push(
              `Page ${index + 1}: ${(result.errorRatio * 100).toFixed(4)}% non-font page pixels differ. ${result.geometry.errors.join(" ")}`,
            );
        }
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
    results.push({ id: fixture.id, sha256: fixture.sha256, failures, pages });
    console.log(
      `${failures.length ? "FAIL" : "PASS"} ${fixture.id}${failures.length ? `: ${failures.join(" ")}` : ""}`,
    );
  }
  const report = {
    pdfium,
    renderer: renderer === "--browser" ? "Chromium canvas" : "native canvas",
    metric:
      "Changed non-font pixels divided by non-font page pixels at 72 DPI; antialiasing excluded; text origins/effective sizes checked within 1% of em; filled-path/image counts and bounds independently checked.",
    limit: 0.01,
    results,
    passed: results.every((result) => !result.failures.length),
  };
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
  console.log(
    JSON.stringify({
      passed: report.passed,
      fixtures: results.length,
      pages: results.reduce((sum, result) => sum + result.pages.length, 0),
      report: join(output, "report.json"),
    }),
  );
}
if (import.meta.main)
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
