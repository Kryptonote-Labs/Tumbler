import { expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { compile } from "svelte/compiler";
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
  const root = resolve(import.meta.dir, "../../..");
  const result = await Bun.build({
    entrypoints: ["presentation-fitting-fixture"],
    target: "browser",
    format: "iife",
    conditions: ["browser"],
    plugins: [
      {
        name: "presentation-fitting",
        setup(builder) {
          builder.onResolve({ filter: /^presentation-fitting-fixture$/ }, () => ({
            path: "entry",
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `import {mount, flushSync} from 'svelte';
            import Text from '${root}/packages/svelte/src/PresentationText.svelte';
            const texts = ${JSON.stringify(texts)};
            for (const text of texts) for (const scale of [1, 0.2]) {
              const host = document.createElement('div');
              host.style.cssText = 'width:1104px;height:139px;position:relative;margin:200px;transform-origin:top left';
              host.style.transform = 'scale(' + scale + ')';
              host.dataset.scale = scale;
              document.body.append(host);
              flushSync(() => mount(Text, {target:host,props:{text}}));
            }`,
            loader: "js",
          }));
          builder.onResolve({ filter: /^svelte(\/.*)?$/ }, ({ path }) => ({
            path:
              path === "svelte"
                ? realpathSync(resolve(root, "apps/docs/node_modules/svelte/src/index-client.js"))
                : Bun.resolveSync(path, resolve(root, "apps/docs")),
          }));
          builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
            contents: compile(await Bun.file(path).text(), {
              filename: path,
              generate: "client",
              css: "injected",
            }).js.code,
            loader: "js",
          }));
        },
      },
    ],
  });
  if (!result.success) throw new Error(result.logs.map(String).join("\n"));
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><body></body>");
    await page.addScriptTag({ content: await result.outputs[0]!.text() });
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
  } finally {
    await browser.close();
  }
}, 30_000);
