import { test, expect } from "@playwright/test";

for (const modifier of ["ctrlKey", "metaKey"] as const) {
  test(`selected-box formatting shortcuts use ${modifier} and consume the event`, async ({ page }) => {
    await page.goto("/playground/slides-brief", { waitUntil: "domcontentloaded" });
    const stage = page.locator(".slide-stage");
    const slide = stage.locator("svg.slide");
    const object = stage.locator("[data-slide-object]").filter({ hasText: "A quieter workspace" });
    await expect(object).toBeVisible({ timeout: 30_000 });
    const dispatch = (key: string, extra: { altKey?: boolean; shiftKey?: boolean } = {}) =>
      slide.evaluate((node, options) => node.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true, cancelable: true, ...options,
      })), { key, [modifier]: true, ...extra });

    // Viewing and an empty selection must leave browser shortcuts alone.
    expect(await dispatch("u")).toBe(true);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    expect(await dispatch("u")).toBe(true);
    await object.click();
    await expect(slide).toBeFocused();
    expect(await dispatch("u", { altKey: true })).toBe(true);
    expect(await dispatch("u", { shiftKey: true })).toBe(true);

    const run = object.locator("[data-text-run]").first();
    for (const [key, property, enabled, disabled] of [
      ["b", "font-weight", "700", "400"],
      ["i", "font-style", "italic", "normal"],
      ["u", "text-decoration-line", "underline", "none"],
    ] as const) {
      const initial = await run.evaluate((node, property) => getComputedStyle(node).getPropertyValue(property), property);
      const toggled = initial === enabled ? disabled : enabled;
      expect(await dispatch(key)).toBe(false);
      await expect(run).toHaveCSS(property, toggled);
      await expect(page.getByRole("textbox", { name: "Edit slide text" })).toHaveCount(0);
      expect(await dispatch(key.toUpperCase())).toBe(false);
      await expect(run).toHaveCSS(property, initial);
    }

    // Leaving a partial text edit must switch the shortcut back to the whole box.
    await object.dblclick();
    const editor = page.getByRole("textbox", { name: "Edit slide text" });
    await editor.press("Control+Home");
    for (let i = 0; i < 9; i++) await editor.press("Shift+ArrowRight");
    await editor.press("Control+i");
    await expect(object.locator("[data-text-run]").first()).toHaveCSS("font-style", "italic");
    await expect(object.locator("[data-text-run]").last()).toHaveCSS("font-style", "normal");
    await editor.press("Control+Enter");
    await object.click();
    expect(await dispatch("i")).toBe(false);
    for (const span of await object.locator("[data-text-run]").all()) {
      await expect(span).toHaveCSS("font-style", "italic");
    }
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(object.locator("[data-text-run]").last()).toHaveCSS("font-style", "normal");
  });
}
