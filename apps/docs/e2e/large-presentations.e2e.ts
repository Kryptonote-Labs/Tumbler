import { test, expect } from "@playwright/test";

// Set this to a local customer deck; never copy its contents into test snapshots.
const file = process.env.TUMBLER_PRESENTATION_FILE;
test("large imported decks keep navigation, fonts and thumbnail counts stable", async ({
  page,
}) => {
  test.skip(
    !file,
    "Set TUMBLER_PRESENTATION_FILE to exercise a private large deck.",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.text().includes("state_proxy_equality_mismatch"))
      errors.push(message.text());
  });
  await page.goto("/playground/slides-brief");
  await expect(page.locator(".slide-stage svg")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles(file!);
  const slides = page.getByLabel("Slide", { exact: true });
  await expect.poll(() => slides.locator("option").count()).toBeGreaterThan(30);
  await page.evaluate(() => document.fonts.ready);
  const fonts = () =>
    page.evaluate(
      () =>
        Array.from(document.fonts).filter((face) =>
          face.family.startsWith("TumblerEmbedded"),
        ).length,
    );
  const count = await slides.locator("option").count(),
    fontCount = await fonts();
  for (const index of [count - 1, 3, Math.floor(count / 2), 0, count - 1]) {
    await slides.selectOption(String(index));
    const active = page.locator(`.slide-rail button[data-index="${index}"]`);
    await expect(active).toHaveAttribute("aria-current", "true");
    await expect
      .poll(() =>
        active.evaluate((button) => {
          const b = button.getBoundingClientRect(),
            r = button.closest(".slide-rail")!.getBoundingClientRect();
          return b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
        }),
      )
      .toBe(true);
    await expect
      .poll(() => page.locator(".slide-rail .slide").count())
      .toBeLessThanOrEqual(10);
    expect(await fonts()).toBe(fontCount);
  }
  await slides.selectOption("3");
  await expect(
    page.locator(".slide-stage pattern image").first(),
  ).toHaveAttribute("href", /^blob:/);
  expect(
    await page.evaluate(
      () =>
        Array.from(document.fonts).filter(
          (face) =>
            face.family.startsWith("TumblerEmbedded") &&
            face.status === "error",
        ).length,
    ),
  ).toBe(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const preview = Array.from(
          document.querySelectorAll(
            '.slide-rail button[aria-current="true"] pattern image',
          ),
          (image) => image.getAttribute("href"),
        );
        const main = Array.from(
          document.querySelectorAll(".slide-stage pattern image"),
          (image) => image.getAttribute("href"),
        );
        return (
          main.length > 0 && main.every((url) => url && preview.includes(url))
        );
      }),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test("imported placeholders and Office pictures edit, move and survive export", async ({
  page,
}) => {
  test.skip(
    !file,
    "Set TUMBLER_PRESENTATION_FILE to exercise a private large deck.",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/playground/slides-brief");
  await expect(page.locator(".slide-stage svg")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles(file!);
  const slides = page.getByLabel("Slide", { exact: true });
  await expect.poll(() => slides.locator("option").count()).toBe(36);
  await slides.selectOption("33");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const stage = page.locator(".slide-stage");
  const title = stage.getByRole("button", { name: "Title 1", exact: true });
  await title.dblclick();
  const input = page.getByRole("textbox", { name: "Edit slide text" });
  await expect(input).toBeVisible();
  await input.fill("An editable imported title");
  await input.press("Control+Enter");
  const updated = stage
    .locator("[data-slide-object]")
    .filter({ hasText: "An editable imported title" });
  await updated.click();
  const before = await updated.getAttribute("transform");
  await stage.locator("svg.slide").press("ArrowRight");
  await expect(updated).not.toHaveAttribute("transform", before!);
  const titleTransform = await updated.getAttribute("transform");
  const picture = stage
    .locator("[data-slide-object]")
    .filter({ has: page.locator("pattern image") })
    .first();
  await picture.click();
  const imageBefore = await picture.getAttribute("transform");
  await stage.locator("svg.slide").press("ArrowDown");
  await expect(picture).not.toHaveAttribute("transform", imageBefore!);
  const imageTransform = await picture.getAttribute("transform");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^Download/ }).click(),
  ]);
  const saved = test.info().outputPath("edited-private-deck.pptx");
  await download.saveAs(saved);
  await page.locator("input[type=file]").setInputFiles(saved);
  await expect(slides).toHaveValue("0");
  await expect.poll(() => slides.locator("option").count()).toBe(36);
  await slides.selectOption("33");
  await expect(updated).toHaveAttribute("transform", titleTransform!);
  await expect(picture).toHaveAttribute("transform", imageTransform!);
  expect(errors).toEqual([]);
});

test("repeated moves keep embedded resources and do not block the next frame", async ({
  page,
}) => {
  test.skip(
    !file,
    "Set TUMBLER_PRESENTATION_FILE to exercise a private large deck.",
  );
  await page.goto("/playground/slides-brief");
  await expect(page.locator(".slide-stage svg")).toBeVisible();
  await page.locator("input[type=file]").setInputFiles(file!);
  const slides = page.getByLabel("Slide", { exact: true });
  await expect.poll(() => slides.locator("option").count()).toBe(36);
  await slides.selectOption("33");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const title = page
    .locator(".slide-stage")
    .getByRole("button", { name: "Title 1", exact: true });
  await title.click();
  await page.evaluate(() => document.fonts.ready);
  const faces = await page.evaluateHandle(() => Array.from(document.fonts));
  const images = await page
    .locator(".slide-stage pattern image")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
  const before = await title.evaluate(
    (n) =>
      (n as unknown as SVGGElement).transform.baseVal.consolidate()!.matrix.e,
  );
  const elapsed = await page
    .locator(".slide-stage svg.slide")
    .evaluate(async (node) => {
      const times: number[] = [];
      for (let i = 0; i < 8; i++) {
        const start = performance.now();
        node.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowRight",
            bubbles: true,
            cancelable: true,
          }),
        );
        await new Promise(requestAnimationFrame);
        times.push(performance.now() - start);
      }
      return times;
    });
  expect(Math.max(...elapsed)).toBeLessThan(250);
  await expect
    .poll(() =>
      title.evaluate(
        (n) =>
          (n as unknown as SVGGElement).transform.baseVal.consolidate()!.matrix
            .e,
      ),
    )
    .toBeCloseTo(before + 8, 3);
  expect(
    await page.evaluate(
      (fonts) => fonts.every((font) => document.fonts.has(font)),
      faces,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".slide-stage pattern image")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href"))),
  ).toEqual(images);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() =>
      title.evaluate(
        (n) =>
          (n as unknown as SVGGElement).transform.baseVal.consolidate()!.matrix
            .e,
      ),
    )
    .toBeCloseTo(before + 7, 3);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect
    .poll(() =>
      title.evaluate(
        (n) =>
          (n as unknown as SVGGElement).transform.baseVal.consolidate()!.matrix
            .e,
      ),
    )
    .toBeCloseTo(before + 8, 3);
});
