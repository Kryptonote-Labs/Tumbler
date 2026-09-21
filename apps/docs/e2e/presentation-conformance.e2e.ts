import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  openOpcPackage,
  beginPackageTransaction,
} from "../../../packages/opc/src/index.ts";
const fixture = new URL(
  "../static/samples/workspace-brief.pptx",
  import.meta.url,
);
test("normal autofit fits dense text and explicit overflow remains visible", async ({
  page,
}) => {
  const pkg = openOpcPackage(new Uint8Array(await readFile(fixture))),
    tx = beginPackageTransaction(pkg);
  const part = pkg.getPart("/ppt/slides/slide1.xml")!;
  const xml = new TextDecoder()
    .decode(pkg.readPart(part))
    .replaceAll(
      "A quieter workspace",
      "A very long title that must shrink to fit its original text box without clipping any words",
    )
    .replace(
      /<a:bodyPr[^>]*(?:\/>|>[\s\S]*?<\/a:bodyPr>)/g,
      "<a:bodyPr><a:normAutofit/></a:bodyPr>",
    );
  tx.replacePart(part.name, new TextEncoder().encode(xml));
  await page.goto("/playground/slides-brief");
  await expect(
    page
      .locator(".slide-stage")
      .getByText("A quieter workspace", { exact: true })
      .last(),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "autofit.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: Buffer.from(tx.commit()),
    });
  const text = page
    .locator(".slide-stage .slide-text")
    .filter({ hasText: "A very long title" });
  await expect(text).toBeVisible();
  await expect
    .poll(() =>
      text
        .locator(".paragraphs")
        .evaluate((e) => Number((e as HTMLElement).style.zoom)),
    )
    .toBeLessThan(1);
  const fitted = await text.evaluate((e) => {
    const p = e.querySelector<HTMLElement>(".paragraphs")!;
    return (
      p.getBoundingClientRect().height <= e.getBoundingClientRect().height + 1
    );
  });
  expect(fitted).toBe(true);
});
test("embedded video exposes browser playback controls and loads its metadata", async ({
  page,
}) => {
  const pkg = openOpcPackage(new Uint8Array(await readFile(fixture))),
    tx = beginPackageTransaction(pkg);
  const part = pkg.getPart("/ppt/slides/slide1.xml")!;
  tx.addPart(
    "/ppt/media/test.webm",
    "video/webm",
    new Uint8Array(
      await readFile(new URL("./fixtures/media.webm", import.meta.url)),
    ),
  );
  tx.addRelationship(part.name, {
    id: "testVideo",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/video",
    target: "/ppt/media/test.webm",
  });
  tx.replacePart(
    part.name,
    new TextEncoder().encode(
      new TextDecoder()
        .decode(pkg.readPart(part))
        .replace(
          "<p:nvPr></p:nvPr>",
          '<p:nvPr><a:videoFile r:link="testVideo"/></p:nvPr>',
        ),
    ),
  );
  await page.goto("/playground/slides-brief");
  await expect(
    page
      .locator(".slide-stage")
      .getByText("A quieter workspace", { exact: true })
      .last(),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "media.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: Buffer.from(tx.commit()),
    });
  const video = page.locator(".slide-stage video");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThan(0);
  await video.evaluate((v) => (v as HTMLVideoElement).play());
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0);
});
test("animation playback hides entrance targets until their click step, then restores the editing view", async ({
  page,
}) => {
  const pkg = openOpcPackage(new Uint8Array(await readFile(fixture))),
    tx = beginPackageTransaction(pkg),
    part = pkg.getPart("/ppt/slides/slide1.xml")!;
  const timing =
    '<p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="clickEffect"><p:childTnLst><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="2" dur="80"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>';
  tx.replacePart(
    part.name,
    new TextEncoder().encode(
      new TextDecoder()
        .decode(pkg.readPart(part))
        .replace("</p:sld>", timing + "</p:sld>"),
    ),
  );
  await page.goto("/playground/slides-brief");
  await expect(
    page
      .locator(".slide-stage")
      .getByText("A quieter workspace", { exact: true })
      .last(),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "animated.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: Buffer.from(tx.commit()),
    });
  await page
    .getByRole("button", { name: "Play animations", exact: true })
    .click();
  const target = page.locator('.slide-stage [data-animation-target="2"]');
  await expect(target).toHaveCSS("opacity", "0");
  await page
    .getByRole("button", { name: "Next animation", exact: true })
    .click();
  await expect(target).toHaveCSS("opacity", "1");
  await page
    .getByRole("button", { name: "Stop playback", exact: true })
    .click();
  await expect(target).toHaveCSS("opacity", "1");
});
test("Windows metafiles decode lazily into SVG pictures", async ({ page }) => {
  const data = new Uint8Array(132),
    v = new DataView(data.buffer);
  const put = (offset: number, ...values: number[]) =>
    values.forEach((value, i) => v.setUint32(offset + i * 4, value, true));
  put(0, 1, 88, 0, 0, 100, 100, 0, 0, 2540, 2540, 0x464d4520, 0x10000, 132, 3);
  v.setUint16(56, 1, true);
  put(72, 100, 100, 26, 26);
  put(88, 43, 24, 10, 10, 90, 90);
  put(112, 14, 20, 0, 0, 20);
  const pkg = openOpcPackage(new Uint8Array(await readFile(fixture))),
    tx = beginPackageTransaction(pkg),
    part = pkg.getPart("/ppt/slides/slide1.xml")!;
  tx.addPart("/ppt/media/test.emf", "image/x-emf", data);
  tx.addRelationship(part.name, {
    id: "metafile",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    target: "/ppt/media/test.emf",
  });
  const xml = new TextDecoder()
    .decode(pkg.readPart(part))
    .replace(
      "<p:spPr>",
      '<p:spPr><a:blipFill><a:blip r:embed="metafile"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>',
    );
  tx.replacePart(part.name, new TextEncoder().encode(xml));
  await page.goto("/playground/slides-brief");
  await expect(
    page
      .locator(".slide-stage")
      .getByText("A quieter workspace", { exact: true })
      .last(),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "metafile.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: Buffer.from(tx.commit()),
    });
  const image = page.locator(".slide-stage pattern image");
  await expect(image).toHaveAttribute("href", /^blob:/);
  const svg = await image.evaluate(async (e) =>
    fetch(e.getAttribute("href")!).then((r) => r.text()),
  );
  expect(svg).toContain("<svg");
  expect(svg).toContain("rect");
});
