import { expect, test } from "bun:test";
import { resolveChartColor, transformChartColor, type ChartModel } from "../src/index.ts";

test("explicit RGB takes precedence and unknown theme slots remain unresolved", () => {
  const model: ChartModel = { status: "unsupported", chartType: undefined, reason: "fixture", title: undefined, legend: undefined, themeColors: { accent1: "#156082" } };
  expect(resolveChartColor({ kind: "rgb", value: "#112233" }, model)).toBe("#112233");
  expect(resolveChartColor({ kind: "scheme", value: "accent1" }, model)).toBe("#156082");
  expect(resolveChartColor({ kind: "scheme", value: "unknown" }, model)).toBeUndefined();
});

test("luminance operations retain hue and saturation through black without intermediate rounding", () => {
  expect(transformChartColor("#0000FF", { kind: "rgb", value: "#0000FF", transforms: [{ kind: "lumMod", value: 0 }, { kind: "lumOff", value: 0.5 }] })).toBe("#0000ff");
});

test('chart colours retain alpha and complete transforms while following the host theme', async () => {
  const { parseLosslessXml } = await import('@tumblerjs/ooxml');
  const { parseChartFill, chartColorFillXml } = await import('../src/formatting-parser.ts');
  const document = parseLosslessXml(new TextEncoder().encode('<a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:solidFill><a:schemeClr val="accent1"><a:shade val="50000"/><a:alpha val="50000"/></a:schemeClr></a:solidFill></a:spPr>'));
  const color = parseChartFill(document.root, document.root.namespaceUri)!;
  const model: ChartModel = { status: 'unsupported', chartType: undefined, reason: 'fixture', title: undefined, legend: undefined, themeColors: { accent1: '#204080' } };
  expect(resolveChartColor(color, model)).toBe('rgba(16,32,64,0.5)');
  expect(resolveChartColor(color, { ...model, themeColors: { accent1: '#80C040' } })).toBe('rgba(64,96,32,0.5)');
  const output = chartColorFillXml(color);
  expect(output).toContain('shade');
  expect(output).toContain('alpha');
  const reloaded = parseLosslessXml(new TextEncoder().encode(`<a:spPr xmlns:a="${document.root.namespaceUri}">${output}</a:spPr>`));
  expect(resolveChartColor(parseChartFill(reloaded.root, document.root.namespaceUri)!, model)).toBe('rgba(16,32,64,0.5)');
});

test('preset, system, HSL and linear RGB colour choices reach the shared chart renderer', async () => {
  const { parseLosslessXml } = await import('@tumblerjs/ooxml');
  const { parseChartFill } = await import('../src/formatting-parser.ts');
  const model: ChartModel = { status: 'unsupported', chartType: undefined, reason: 'fixture', title: undefined, legend: undefined };
  for (const [choice, expected] of [
    ['<a:prstClr val="dkSeaGreen"/>', 'rgba(143,188,143,1)'],
    ['<a:sysClr val="windowText" lastClr="102030"/>', 'rgba(16,32,48,1)'],
    ['<a:sysClr val="windowText"/>', 'rgba(0,0,0,1)'],
    ['<a:sysClr val="windowText"><a:alpha val="0"/></a:sysClr>', 'rgba(0,0,0,0)'],
    ['<a:hslClr hue="0" sat="100000" lum="50000"/>', 'rgba(255,0,0,1)'],
    ['<a:scrgbClr r="100000" g="0" b="0"/>', 'rgba(255,0,0,1)'],
  ]) {
    const document = parseLosslessXml(new TextEncoder().encode(`<a:spPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:solidFill>${choice}</a:solidFill></a:spPr>`));
    expect(resolveChartColor(parseChartFill(document.root, document.root.namespaceUri)!, model)).toBe(expected);
  }
});


test('3D shading changes RGB channels while preserving colour-source transparency', async () => {
  const { chartShade } = await import('../src/projection.ts');
  expect(chartShade('rgba(100,200,50,0.25)', .5)).toBe('rgba(50,100,25,0.25)');
  expect(chartShade('rgba(100,200,50,1)', .5)).toBe('rgba(50,100,25,1)');
});
