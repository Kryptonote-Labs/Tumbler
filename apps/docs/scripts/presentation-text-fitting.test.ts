import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { beginPackageTransaction } from "../../../packages/opc/src/index.ts";
import {
  applyPresentationCommand,
  createPresentation,
  openPresentationArtifact,
} from "../../../packages/slides/src/index.ts";

// Three large paragraphs in a shallow, centred title placeholder reproduce the Acme closer.
function titleDeck() {
  let deck = createPresentation();
  const slideId = deck.document.slides[0]!.id;
  deck = applyPresentationCommand(deck, { name: "layout", slideId, layout: "title-content" });
  const object = deck.document.slides[0]!.objects.find((o) => o.placeholder === "title")!;
  deck = applyPresentationCommand(deck, {
    name: "edit-text",
    slideId,
    objectKey: object.key,
    start: 0,
    end: 0,
    value: "THIS IS WHAT\nCOMPOUNDING\nLOOKS LIKE.",
  });
  return applyPresentationCommand(deck, {
    name: "format-text",
    slideId,
    objectKey: object.key,
    start: 0,
    end: "THIS IS WHAT\nCOMPOUNDING\nLOOKS LIKE.".length,
    patch: { text: { fontSize: { set: 64 } } },
  });
}

test("saved PowerPoint text sizes survive overflow in the editor and scaled thumbnails", async () => {
  const deck = titleDeck();
  const pkg = deck.document.package;
  const part = pkg.getPart(deck.document.slides[0]!.part)!;
  const xml = new TextDecoder().decode(pkg.readPart(part));
  const texts = [undefined, "80000"].map((scale) => {
    const tx = beginPackageTransaction(pkg);
    if (scale)
      tx.replacePart(
        part.name.value,
        new TextEncoder().encode(
          xml.replace(
            /<a:bodyPr[^>]*(?:\/>|>[\s\S]*?<\/a:bodyPr>)/,
            `<a:bodyPr anchor="ctr"><a:normAutofit fontScale="${scale}"/></a:bodyPr>`,
          ),
        ),
      );
    const saved = openPresentationArtifact(scale ? tx.commit() : deck.bytes());
    return saved.document.slides[0]!.objects.find((o) => o.placeholder === "title")!.text!;
  });
  expect(texts.map((text) => text.autoFit)).toEqual(["normal", "normal"]);
  expect(texts[0]!.paragraphs[0]!.runs[0]!.fontSize).toBeCloseTo((64 * 4) / 3);
  expect(texts[1]!.paragraphs[0]!.runs[0]!.fontSize).toBeCloseTo(((64 * 4) / 3) * 0.8);
  const build = Bun.spawn(
    [process.execPath, resolve(import.meta.dir, "presentation-text-fixture.ts")],
    {
      stdin: new Response(JSON.stringify(texts)),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, script, buildError] = await Promise.all([
    build.exited,
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(buildError);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><body></body>");
    await page.addScriptTag({ content: script });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    const rendered = await page.locator("body > div").evaluateAll((hosts) =>
      hosts.map((host) => {
        const paragraphs = host.querySelector<HTMLElement>(".paragraphs")!;
        const run = host.querySelector<HTMLElement>("[data-text-run]")!;
        const scale = Number((host as HTMLElement).dataset.scale);
        return {
          zoom: getComputedStyle(paragraphs).zoom,
          fontSize: parseFloat(getComputedStyle(run).fontSize),
          top: (paragraphs.getBoundingClientRect().top - host.getBoundingClientRect().top) / scale,
          height: paragraphs.getBoundingClientRect().height / scale,
        };
      }),
    );
    for (const [i, value] of rendered.entries()) {
      expect(value.zoom).toBe("1");
      expect(value.fontSize).toBeCloseTo(((64 * 4) / 3) * (i < 2 ? 1 : 0.8), 3);
      expect(value.height).toBeGreaterThan(139);
      expect(value.top).toBeLessThan(0);
      expect(value.top).toBeCloseTo((139 - value.height) / 2, 0);
    }
    expect(rendered[0]!.height).toBeCloseTo(rendered[1]!.height, 3);
    expect(rendered[2]!.height).toBeCloseTo(rendered[3]!.height, 3);

    const clipped = await page.locator(".canvas-overflow").evaluateAll((canvases) =>
      canvases.map((canvas) => {
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Expected canvas fixture");
        const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
        let inside = 0,
          right = 0,
          below = 0;
        for (let y = 0; y < canvas.height; y++)
          for (let x = 0; x < canvas.width; x++) {
            if (!data[(y * canvas.width + x) * 4 + 3]) continue;
            if (x >= 40 && x < 90 && y >= 40 && y < 60) inside++;
            if (x >= 90) right++;
            if (y >= 60) below++;
          }
        return {
          inside,
          right,
          below,
          clipX: canvas.dataset.clipX === "true",
          clipY: canvas.dataset.clipY === "true",
        };
      }),
    );
    expect(clipped).toHaveLength(8);
    for (const canvas of clipped) {
      expect(canvas.inside).toBeGreaterThan(0);
      if (canvas.clipX) expect(canvas.right).toBe(0);
      else expect(canvas.right).toBeGreaterThan(0);
      if (canvas.clipY) expect(canvas.below).toBe(0);
      else expect(canvas.below).toBeGreaterThan(0);
    }
  } finally {
    await browser.close();
  }
}, 30_000);
