import { expect, test } from "bun:test";
import { canvasWordTextMeasurer, createWordArtifact, NativeWordDocument } from "../src/index.ts";

test("canvas measurement converts CSS pixels to points and keeps a run's font box", () => {
  const context = { font: "", direction: "inherit" as const, measureText: (text: string) => {
    const scale = Number(/([\d.]+)px/.exec(context.font)?.[1]) / 16;
    return { width: text.length * 8 * scale, fontBoundingBoxAscent: 12 * scale, fontBoundingBoxDescent: 4 * scale };
  } };
  const format = { fontFamily: "Arial", fontSizePoints: 12, bold: false, italic: false, underline: "none" as const, strike: false, color: "#000000", highlight: undefined, verticalAlign: "baseline" as const, rightToLeft: false };
  expect(canvasWordTextMeasurer(context).measure("Hi", format)).toEqual({ width: 12, ascent: 9, descent: 3 });
  expect(context.font).toBe('normal normal 400 1000px "Arial", sans-serif');
});

test('fractional display scaling cannot wrap a fitting Arial word onto the next line', () => {
  const text = 'style, the whole document follows it, briefly establishing a consistency that nobody thought to';
  // Captured from Firefox on Windows at 125% display scaling. The small-size
  // Canvas advance exceeds the 451.3pt column even though the DOM text fits.
  const context = { font: '', direction: 'ltr' as const, measureText(value: string) {
    const size = Number(/([\d.]+)px/.exec(context.font)?.[1]);
    const points = size < 100 ? 452.0625 : 451.2550625;
    return { width: points * size / 11 * value.length / text.length };
  } };
  const native = new NativeWordDocument({
    defaultFormat: { fontFamily: 'Arial', fontSizePoints: 11, kerningPoints: 1 },
    content: [{ kind: 'paragraph', runs: [{ text }] }],
  });
  const lines = native.layout(canvasWordTextMeasurer(context)).pages[0]!.columns[0]!.lines;
  expect(lines.map(line => line.fragments.map(fragment => fragment.text).join(''))).toEqual([text]);
  expect(lines[0]!.width).toBeCloseTo(451.2550625, 5);
});

test("canvas measurement shapes each distinct run once", () => {
  let calls = 0;
  const context = { font: "", direction: "inherit" as const, measureText: (text: string) => (calls++, { width: text.length * 8 }) };
  const format = { fontFamily: "Arial", fontSizePoints: 12, bold: false, italic: false, underline: "none" as const, strike: false, color: "#000000", highlight: undefined, verticalAlign: "baseline" as const, rightToLeft: false };
  const measurer = canvasWordTextMeasurer(context);
  for (const text of ["a", "b", "a", "a"]) measurer.measure(text, format);
  measurer.measure("a", { ...format, bold: true });
  expect(calls).toBe(3);
});

test('normalising font size preserves point-based character spacing per grapheme', () => {
  const context = { font: '', direction: 'ltr' as const, measureText() {
    return { width: Number(/([\d.]+)px/.exec(context.font)?.[1]) };
  } };
  const source = createWordArtifact({ defaultFormat: { fontFamily: 'Arial', fontSizePoints: 12, characterSpacingPoints: 0.2 } });
  const format = source.document.styles.resolveStyledRun('Normal');
  const measure = canvasWordTextMeasurer(context);
  expect(measure.measure('a\u0301b', format).width).toBeCloseTo(12.4);
  expect(measure.measure('a\u0301b', { ...format, fontSizePoints: 24 }).width).toBeCloseTo(24.4);
});

test('a host can load a font before its first canvas measurement', () => {
  const events: string[] = [];
  const context = { font: '', direction: 'inherit' as const, measureText() {
    events.push('measure');
    expect(events[0]).toBe('prepare:Arial');
    return { width: 8 };
  } };
  const source = createWordArtifact({ defaultFormat: { fontFamily: 'Arial', fontSizePoints: 12 } });
  const format = source.document.styles.resolveStyledRun('Normal');
  const measurer = canvasWordTextMeasurer(context, {
    prepare(family) { events.push('prepare:' + JSON.parse(family.split(',')[0]!)); },
    measure() { return { ascent: 9, descent: 3 }; },
  });
  expect(measurer.measure('x', format)).toEqual({ width: 0.096, ascent: 9, descent: 3 });
  measurer.measure('x', format);
  expect(events).toEqual(['prepare:Arial', 'measure']);
});

test('measurement caches follow mutable public formats and external canvas state changes', () => {
  const context = { font: '', direction: 'inherit' as 'inherit' | 'ltr' | 'rtl', fontKerning: 'auto' as 'auto' | 'normal' | 'none', measureText(text: string) {
    const size = Number(/([\d.]+)px/.exec(context.font)?.[1]);
    return { width: text.length * size };
  } };
  const format = { ...createWordArtifact().document.styles.resolveStyledRun('Normal'), fontSizePoints: 12 };
  const measure = canvasWordTextMeasurer(context);
  expect(measure.measure('a', format).width).toBe(12);
  format.fontSizePoints = 24;
  expect(measure.measure('a', format).width).toBe(24);
  context.font = 'normal 10px serif';
  context.direction = 'rtl';
  context.fontKerning = 'auto';
  expect(measure.measure('bb', format).width).toBe(48);
  expect(context).toHaveProperty('direction', 'ltr');
});
