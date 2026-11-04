/// <reference types="bun" />
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const build = Bun.spawn(
  [process.execPath, resolve(import.meta.dir, "pdf-editing-fixture.ts"), "--text-box"],
  {
    stdout: "pipe",
    stderr: "pipe",
  },
);
const [code, script, error] = await Promise.all([
  build.exited,
  new Response(build.stdout).text(),
  new Response(build.stderr).text(),
]);
if (code !== 0) throw new Error(error);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://fixture.local/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }),
  );
  await page.goto("https://fixture.local/");
  await page.addScriptTag({ content: script });
  const glyphs = page.locator('[data-pdf-page="1"] .glyph');
  const point = async (index: number, fraction = 0.5) => {
    const rect = (await glyphs.nth(index).boundingBox())!;
    return { x: rect.x + rect.width * fraction, y: rect.y + rect.height * 0.6 };
  };
  const drag = async (from: { x: number; y: number }, dx: number, dy: number) => {
    await page.mouse.move(from.x, from.y);
    await page.keyboard.down("Alt");
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 2 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
  };
  const first = await point(0);
  await page.mouse.click(first.x, first.y);
  const box = page.getByRole("toolbar", { name: "Selected text box" });
  const before = (await box.boundingBox())!;
  const handle = (await page
    .getByRole("button", { name: "Move text box", exact: true })
    .boundingBox())!;
  await drag({ x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, 40, 24);
  const moved = (await box.boundingBox())!;
  assert(Math.abs(moved.x - before.x - 40) < 0.1);
  assert(Math.abs(moved.y - before.y - 24) < 0.1);

  const input = page.getByLabel("Edit PDF text");
  const second = await point(8);
  await page.mouse.dblclick(second.x, second.y);
  assert.deepEqual(
    await input.evaluate((element: HTMLTextAreaElement) => ({
      focused: document.activeElement === element,
      selected: element.value.slice(element.selectionStart, element.selectionEnd),
    })),
    { focused: true, selected: "second" },
  );

  const from = await point(13, 0.05),
    to = await point(17, 0.95);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 2 });
  await page.mouse.up();
  assert.equal(
    await input.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd),
    ),
    "third",
  );
  assert.deepEqual(await box.boundingBox(), moved, "selecting text must not move the box");
  await input.pressSequentially("replaced");
  assert.equal(await input.inputValue(), "First second replaced");

  const edited = (await box.boundingBox())!;
  await drag({ x: edited.x, y: edited.y + edited.height / 2 }, 16, 10);
  const borderMoved = (await box.boundingBox())!;
  assert(Math.abs(borderMoved.x - edited.x - 16) < 0.1, "the border must remain draggable");
  assert(Math.abs(borderMoved.y - edited.y - 10) < 0.1);
  assert.equal(await input.inputValue(), "First second replaced");
  const again = await point(0);
  await page.mouse.dblclick(again.x, again.y);
  assert.equal(
    await input.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd),
    ),
    "First",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Moved PDF text supports word selection, drag selection and typing; handle and border dragging remain available.",
  );
} finally {
  await browser.close();
}
