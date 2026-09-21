import { test, expect } from "@playwright/test";

test("presentations navigate, edit, move, resize, undo, and reopen downloaded bytes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/playground/slides-brief");
  const stage = page.locator(".slide-stage .presentation-view");
  await expect(
    stage.getByText("A quieter workspace", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next slide", exact: true }).click();
  await expect(
    stage.getByText("Working principles", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next slide", exact: true }).click();
  await expect(stage.locator(".chart-frame svg")).toBeVisible();
  await page.getByLabel("Slide", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const object = stage
    .locator("[data-slide-object]")
    .filter({ hasText: "A quieter workspace" });
  await object.dblclick();
  const input = page.getByRole("textbox", { name: "Edit slide text" });
  await input.fill("A better workspace");
  await input.press("Control+Enter");
  await expect(
    stage.getByText("A better workspace", { exact: true }).last(),
  ).toBeVisible();
  const updated = stage
    .locator("[data-slide-object]")
    .filter({ hasText: "A better workspace" });
  const before = (await updated.getAttribute("transform"))!;
  await updated.click();
  await page.locator(".slide-stage svg.slide").press("ArrowRight");
  await expect(updated).not.toHaveAttribute("transform", before);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(updated).toHaveAttribute("transform", before);
  // Drag at a different zoom to check screen/document coordinate conversion.
  await page.getByLabel("Zoom", { exact: true }).selectOption("0.75");
  await updated.scrollIntoViewIfNeeded();
  const box = (await updated.locator("rect.hit").boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect(updated).not.toHaveAttribute("transform", before);
  const handle = stage.getByRole("button", {
    name: /^Resize .* bottom right$/,
  });
  await expect(handle).toBeVisible();
  const oldWidth = await updated.locator("rect.hit").getAttribute("width");
  await handle.focus();
  await handle.press("ArrowRight");
  await expect(updated.locator("rect.hit")).not.toHaveAttribute(
    "width",
    oldWidth!,
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^Download/ }).click(),
  ]);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(
    stage.getByText("A quieter workspace", { exact: true }).last(),
  ).toBeVisible();
  const saved = test.info().outputPath("edited.pptx");
  await download.saveAs(saved);
  await page.getByLabel("Choose a document").setInputFiles(saved);
  await expect(
    stage.getByText("A better workspace", { exact: true }).last(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("compatibility limits are visible; samples and component preview fit narrow screens", async ({
  page,
}) => {
  await page.goto("/playground/slides-compatibility");
  await expect(
    page.locator(".slide-stage").getByText("Milestone", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".slide-stage [data-table-cell]")).toHaveCount(9);
  const rail = page.getByRole("navigation", { name: "Slides", exact: true });
  await rail.getByRole("button", { name: /^Slide 2:/ }).click();
  await expect(rail.getByRole("button", { name: /^Slide 2:/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(
    page
      .locator(".slide-stage")
      .getByText("Preview unavailable", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", { name: "Grouped rectangle", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Resize Grouped rectangle bottom right",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/components");
  await expect(
    page.getByText("A quieter workspace", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "PresentationSlideView", exact: true })
    .click();
  await expect(
    page
      .locator(".slide-example")
      .getByText("A quieter workspace", { exact: true })
      .last(),
  ).toBeVisible();
  await page.getByLabel("Slide", { exact: true }).selectOption("2");
  await expect(page.locator(".slide-example .chart-frame svg")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.goto("/playground/slides-visuals");
  await expect(
    page
      .locator(".slide-stage .presentation-view")
      .getByText("Shapes and pictures", { exact: true })
      .last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next slide", exact: true }).click();
  await expect(
    page.locator(".slide-stage .presentation-view image"),
  ).toHaveAttribute("href", /^blob:/);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});

test("slide thumbnails switch with keyboard and reflect edits without changing zoom", async ({
  page,
}) => {
  await page.goto("/playground/slides-brief");
  const rail = page.getByRole("navigation", { name: "Slides", exact: true });
  const first = rail.getByRole("button", { name: /^Slide 1:/ });
  await expect(first.locator("svg.slide")).toBeVisible();
  await first.focus();
  await first.press("ArrowDown");
  await expect(rail.getByRole("button", { name: /^Slide 2:/ })).toBeFocused();
  await expect(page.getByLabel("Slide", { exact: true })).toHaveValue("1");
  await page.getByLabel("Zoom", { exact: true }).selectOption("0.75");
  await rail.getByRole("button", { name: /^Slide 2:/ }).press("Home");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .locator(".slide-stage [data-slide-object]")
    .filter({ hasText: "A quieter workspace" })
    .dblclick();
  await page.getByLabel("Edit slide text").fill("Thumbnail updates too");
  await page.getByLabel("Edit slide text").press("Control+Enter");
  await expect(
    rail
      .getByRole("button", { name: "Slide 1: Thumbnail updates too" })
      .locator("span")
      .getByText("Thumbnail updates too", { exact: true })
      .last(),
  ).toBeAttached();
  await expect(page.getByLabel("Zoom", { exact: true })).toHaveValue("0.75");
  const bounds = await page.locator(".slide-stage").boundingBox();
  const preview = await rail.boundingBox();
  expect(preview!.x + preview!.width).toBeLessThanOrEqual(bounds!.x + 1);
  await page.getByLabel("Viewer width").selectOption("360");
  await expect
    .poll(() =>
      page
        .locator(".viewer-frame")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    )
    .toBe(true);
});

test("DrawingML shapes, theme tables, notes, and internal links render together", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/playground/slides-standards");
  const stage = page.locator(".slide-stage");
  await expect(
    stage.getByText("Shapes and connectors", { exact: true }).last(),
  ).toBeVisible();
  await expect(stage.locator("linearGradient")).toHaveCount(1);
  await expect(
    stage.getByText("Preview unavailable", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Slide", { exact: true }).selectOption("1");
  await stage.getByRole("link", { name: "Back to the shape gallery" }).click();
  await expect(page.getByLabel("Slide", { exact: true })).toHaveValue("0");
  await page.getByLabel("Slide", { exact: true }).selectOption("2");
  await expect(stage.locator("[data-table-cell]")).toHaveCount(12);
  await expect(stage.getByText("Milestone", { exact: true })).toBeVisible();
  await page.getByLabel("Slide", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await stage
    .locator("[data-slide-object]")
    .filter({ hasText: "Back to the shape gallery" })
    .dblclick();
  await expect(
    page.getByRole("textbox", { name: "Edit slide text" }),
  ).toBeVisible();
  await stage.getByRole("link", { name: "Back to the shape gallery" }).click();
  await expect(page.getByLabel("Slide", { exact: true })).toHaveValue("1");
  expect(errors).toEqual([]);
});

test("in-place text keeps its layout and selected-word formatting and shape styles survive export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/playground/slides-brief");
  await expect(
    page
      .locator(".slide-stage [data-text-run]")
      .filter({ hasText: "A quieter workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const object = page
    .locator(".slide-stage [data-slide-object]")
    .filter({ hasText: "A quieter workspace" });
  const span = object.locator("[data-text-run]").first();
  const before = await span.boundingBox();
  const font = await span.evaluate((n) => {
    const s = getComputedStyle(n);
    return [s.fontFamily, s.fontSize, s.fontWeight, s.color];
  });
  await object.dblclick();
  const editor = page.getByRole("textbox", { name: "Edit slide text" });
  await expect(editor).toBeVisible();
  const after = await span.boundingBox();
  expect(after!.x).toBeCloseTo(before!.x, 1);
  expect(after!.y).toBeCloseTo(before!.y, 1);
  expect(
    await span.evaluate((n) => {
      const s = getComputedStyle(n);
      return [s.fontFamily, s.fontSize, s.fontWeight, s.color];
    }),
  ).toEqual(font);
  await editor.press("Control+Home");
  for (let i = 0; i < 9; i++) await editor.press("Shift+ArrowRight");
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await expect(object.locator("[data-text-run]").first()).toHaveCSS(
    "font-style",
    "italic",
  );
  await expect(object.locator("[data-text-run]").last()).toHaveCSS(
    "font-style",
    "normal",
  );
  await page.getByLabel("Font size", { exact: true }).fill("28");
  await page.getByLabel("Font size", { exact: true }).press("Enter");
  await expect(editor).toBeFocused();
  await expect(object.locator("[data-text-run]").first()).toHaveCSS(
    "font-size",
    "37.3333px",
  );
  await editor.press("ArrowRight");
  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially("Second line");
  await expect(editor).toContainText("Second line");
  await editor.press("Control+Enter");
  await page.getByLabel("Shape fill colour", { exact: true }).fill("#ddeeff");
  await page
    .getByLabel("Shape outline colour", { exact: true })
    .fill("#112233");
  await page.getByLabel("Outline width", { exact: true }).fill("2");
  await page.getByLabel("Outline width", { exact: true }).press("Tab");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^Download/ }).click(),
  ]);
  const saved = test.info().outputPath("formatted.pptx");
  await download.saveAs(saved);
  await page.getByLabel("Choose a document").setInputFiles(saved);
  const reopened = page
    .locator(".slide-stage [data-slide-object]")
    .filter({ hasText: "Second line" });
  await expect(reopened.locator("[data-text-run]").first()).toHaveCSS(
    "font-style",
    "italic",
  );
  await expect(reopened.locator("path").first()).toHaveAttribute(
    "fill",
    "rgba(221,238,255,1)",
  );
  await expect(reopened.locator("path").first()).toHaveAttribute(
    "stroke",
    "rgba(17,34,51,1)",
  );
  expect(errors).toEqual([]);
});

test("caret formatting and plain-text paste work at reduced zoom without moving the text box", async ({
  page,
}) => {
  await page.goto("/playground/slides-brief");
  const object = page
    .locator(".slide-stage [data-slide-object]")
    .filter({ hasText: "A quieter workspace" });
  await expect(object).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Zoom", { exact: true }).selectOption("0.75");
  await object.dblclick();
  const editor = page.getByRole("textbox", { name: "Edit slide text" });
  await expect(editor).toBeVisible();
  const transform = await object.getAttribute("transform");
  await editor.press("Control+End");
  await editor.press("Control+i");
  await editor.pressSequentially("XYZ");
  await expect(object.locator("[data-text-run]").last()).toHaveText("XYZ");
  await expect(object.locator("[data-text-run]").last()).toHaveCSS(
    "font-style",
    "italic",
  );
  await editor.evaluate((node) => {
    const data = new DataTransfer();
    data.setData("text/plain", " <b>literal</b>\nNext");
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(editor).toContainText("<b>literal</b>");
  await expect(editor.locator("b")).toHaveCount(0);
  await expect(editor).toContainText("Next");
  await editor.press("Backspace");
  await expect(editor).toContainText("Nex");
  await editor.press("Control+z");
  await expect(editor).toContainText("Next");
  await expect(object).toHaveAttribute("transform", transform!);
});

test("rotated shapes resize around their opposite corner and rotate with undo and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/playground/slides-visuals");
  await expect(
    page
      .locator(".slide-stage")
      .getByText("Shapes and pictures", { exact: true })
      .last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Zoom", { exact: true }).selectOption("0.75");
  const object = page.locator(
    '.slide-stage [data-slide-object][aria-label="Shape 2"]',
  );
  await object.click();
  const geometry = () =>
    object.evaluate((node) => {
      const group = node as SVGGElement;
      const rect = group.querySelector("rect.hit")!;
      const matrix = group.transform.baseVal.consolidate()!.matrix;
      const w = Number(rect.getAttribute("width")),
        h = Number(rect.getAttribute("height"));
      return {
        x: matrix.e,
        y: matrix.f,
        w,
        h,
        angle: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
        centerX: matrix.e + (matrix.a * w) / 2 + (matrix.c * h) / 2,
        centerY: matrix.f + (matrix.b * w) / 2 + (matrix.d * h) / 2,
      };
    });
  const before = await geometry();
  const handle = page.getByRole("button", {
    name: "Resize Shape 2 bottom right",
    exact: true,
  });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 55,
    box.y + box.height / 2 + 35,
    { steps: 5 },
  );
  await page.mouse.up();
  const resized = await geometry();
  expect(resized.w).toBeGreaterThan(before.w);
  expect(resized.h).toBeGreaterThan(before.h);
  expect(resized.x).toBeCloseTo(before.x, 2);
  expect(resized.y).toBeCloseTo(before.y, 2);
  expect(resized.angle).toBeCloseTo(18, 4);
  const rotate = page.getByRole("button", {
    name: "Rotate Shape 2",
    exact: true,
  });
  const rotationBox = (await rotate.boundingBox())!;
  const center = await object.evaluate((node) => {
    const group = node as SVGGElement;
    const hit = group.querySelector("rect.hit")!;
    return new DOMPoint(
      Number(hit.getAttribute("width")) / 2,
      Number(hit.getAttribute("height")) / 2,
    )
      .matrixTransform(group.getScreenCTM()!)
      .toJSON();
  });
  const rx = rotationBox.x + rotationBox.width / 2 - center.x,
    ry = rotationBox.y + rotationBox.height / 2 - center.y;
  await page.keyboard.down("Shift");
  await page.mouse.move(center.x + rx, center.y + ry);
  await page.mouse.down();
  await page.mouse.move(center.x - ry, center.y + rx, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const rotated = await geometry();
  expect(rotated.angle).toBeCloseTo(105, 3);
  expect(rotated.centerX).toBeCloseTo(resized.centerX, 3);
  expect(rotated.centerY).toBeCloseTo(resized.centerY, 3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await geometry()).angle).toBeCloseTo(18, 3);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  // Cancelling a preview must not create a history entry or change the saved transform.
  const transform = await object.getAttribute("transform");
  const rb = (await rotate.boundingBox())!;
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + 50, rb.y + 30, { steps: 3 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(object).toHaveAttribute("transform", transform!);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^Download/ }).click(),
  ]);
  const path = test.info().outputPath("rotated.pptx");
  await download.saveAs(path);
  await page.getByLabel("Choose a document").setInputFiles(path);
  await expect(object).toHaveAttribute("transform", transform!);
  await expect(page.getByText("rotated.pptx", { exact: true })).toBeVisible();
  await page.getByLabel("Zoom", { exact: true }).selectOption("1.25");
  await object.click();
  await page
    .getByRole("button", { name: "Rotate Shape 2", exact: true })
    .press("Home");
  expect((await geometry()).angle).toBeCloseTo(0, 3);
  expect(errors).toEqual([]);
});

test("table cells edit in place, format, navigate with Tab, and resize without stretching text", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/playground/slides-standards");
  await expect(
    page
      .locator(".slide-stage")
      .getByText("Shapes and connectors", { exact: true })
      .last(),
  ).toBeVisible();
  await page.getByLabel("Slide", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const table = page
    .locator(".slide-stage [data-slide-object]")
    .filter({ has: page.locator("[data-table-cell]") });
  const cell = table.locator('[data-table-cell="1:1"]');
  const span = cell.locator("[data-text-run]").first();
  const before = await span.boundingBox();
  await cell.dblclick();
  let editor = page.getByRole("textbox", { name: "Edit slide text" });
  await expect(editor).toBeVisible();
  const after = await span.boundingBox();
  expect(after!.x).toBeCloseTo(before!.x, 1);
  expect(after!.y).toBeCloseTo(before!.y, 1);
  await editor.fill("Product team");
  await editor.press("Control+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(cell.locator("[data-text-run]").first()).toHaveCSS(
    "font-weight",
    "700",
  );
  await page.getByRole("button", { name: "Align center", exact: true }).click();
  await expect(cell.locator("[data-text-paragraph]")).toHaveCSS(
    "text-align",
    "center",
  );
  await editor.press("Tab");
  await expect(
    table.locator('[data-table-cell="1:2"] [role="textbox"]'),
  ).toBeFocused();
  await editor.fill("Ready");
  await editor.press("Shift+Tab");
  await expect(cell.locator('[role="textbox"]')).toBeFocused();
  await editor.press("Control+Enter");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(table.locator('[data-table-cell="1:2"]')).toContainText(
    "Complete",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(table.locator('[data-table-cell="1:2"]')).toContainText("Ready");
  const oldWidth = (await cell.boundingBox())!.width,
    oldFont = await cell
      .locator("[data-text-run]")
      .first()
      .evaluate((n) => getComputedStyle(n).fontSize);
  const handle = page.getByRole("button", { name: /^Resize .* bottom right$/ });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 30, { steps: 5 });
  await page.mouse.up();
  expect((await cell.boundingBox())!.width).toBeGreaterThan(oldWidth);
  await expect(cell.locator("[data-text-run]").first()).toHaveCSS(
    "font-size",
    oldFont,
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^Download/ }).click(),
  ]);
  const saved = test.info().outputPath("edited-table.pptx");
  await download.saveAs(saved);
  await page.getByLabel("Choose a document").setInputFiles(saved);
  await expect(
    page.getByText("edited-table.pptx", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Slide", { exact: true }).selectOption("2");
  await expect(cell).toContainText("Product team");
  await expect(cell.locator("[data-text-run]").first()).toHaveCSS(
    "font-weight",
    "700",
  );
  await expect(table.locator('[data-table-cell="1:2"]')).toContainText("Ready");
  await expect(
    table.locator('[data-table-cell="0:0"] rect').first(),
  ).not.toHaveAttribute("fill", "none");
  expect(errors).toEqual([]);
});

test("grouped shapes follow the pointer without losing their group scale", async ({
  page,
}) => {
  await page.goto("/playground/slides-compatibility");
  const slides = page.getByLabel("Slide", { exact: true });
  await expect(slides).toBeVisible();
  await slides.selectOption("1");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const object = page.locator(
    '.slide-stage [data-slide-object][aria-label="Grouped rectangle"]',
  );
  await expect(object).toBeVisible();
  const bounds = await object.locator("rect.hit").boundingBox();
  const x = bounds!.x + bounds!.width / 2,
    y = bounds!.y + bounds!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 36, y + 24, { steps: 5 });
  const preview = await object.locator("rect.hit").boundingBox();
  expect(preview!.x - bounds!.x).toBeCloseTo(36, 0);
  expect(preview!.y - bounds!.y).toBeCloseTo(24, 0);
  await page.mouse.up();
  await expect
    .poll(async () => (await object.locator("rect.hit").boundingBox())!.x)
    .toBeCloseTo(bounds!.x + 36, 0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await object.locator("rect.hit").boundingBox())!.x)
    .toBeCloseTo(bounds!.x, 0);
});
