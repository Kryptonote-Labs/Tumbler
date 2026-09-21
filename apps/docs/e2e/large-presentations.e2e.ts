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
