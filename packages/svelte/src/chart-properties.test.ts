import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { chartPropertyTree, createOoxmlChart, parseOoxmlChart, type ChartPropertyNode } from "@tumblerjs/charts";
import { CHART_TYPE_FAMILIES, chartPropertyLabels, currentChartType, removableChartProperties, setChartPropertyValue, chartPropertyChild } from "./chart-properties.ts";

const fixture = readFileSync(new URL("../../charts/test/fixtures/word-default-chart.xml", import.meta.url));

describe("chart type options", () => {
  test("each option is recognised as itself once the chart is created", () => {
    for (const option of CHART_TYPE_FAMILIES.flatMap((family) => family.options)) {
      const series = option.change.type === "stockChart"
        ? [1, 2, 3].map((index) => ({ name: `Price ${index}`, values: [1, 2] }))
        : [{ name: "Sales", values: [1, 2], ...(option.change.type === "bubbleChart" ? { bubbleSizes: [1, 2] } : {}) }];
      const bytes = createOoxmlChart({ ...option.change, categories: ["A", "B"], series });
      expect(currentChartType(chartPropertyTree(bytes))?.label).toBe(option.label);
    }
  });
});

describe("removable properties", () => {
  const tree = chartPropertyTree(fixture);
  const labels = chartPropertyLabels(tree);
  const removable = removableChartProperties(tree);
  const named = (label: string) => {
    const found: ChartPropertyNode[] = [];
    const visit = (node: ChartPropertyNode) => { if (labels.get(node.id) === label) found.push(node); node.children.forEach(visit); };
    visit(tree);
    return found;
  };

  test("offers optional properties, including the chosen fill of an optional choice", () => {
    for (const label of ["Title", "Legend", "No Fill", "Gap Width"]) expect(named(label).some((node) => removable.has(node.id))).toBe(true);
  });

  test("never offers properties the content model or series identity requires", () => {
    for (const label of ["Chart", "Plot Area", "Bar Direction", "Index", "Order", "Body Properties", "Axis Id 1"])
      expect(named(label).every((node) => !removable.has(node.id))).toBe(true);
  });
});


test('the gallery treats present empty boolean properties as true', () => {
  const bytes = createOoxmlChart({ type: 'bubbleChart', categories: [], series: [{ name: 'Data', values: [1], xValues: [1], bubbleSizes: [1] }], bubble3D: true });
  const empty = new TextEncoder().encode(new TextDecoder().decode(bytes).replace('<c:bubble3D val="1"/>', '<c:bubble3D/>'));
  expect(currentChartType(chartPropertyTree(empty))?.label).toBe('3-D bubble');
});


test('3D property controls preserve chart data while setting and restoring automatic dimensions', () => {
  for (const conformance of ['strict', 'transitional'] as const) {
    const original = createOoxmlChart({ type: 'bar3DChart', conformance, categories: ['A'], series: [{ name: 'Data', values: [2] }] });
    const view = (root: ChartPropertyNode) => chartPropertyChild(chartPropertyChild(root, 'chart'), 'view3D');
    const changed = setChartPropertyValue(original, view, 'hPercent', 'c:CT_HPercent/c:hPercent', '50');
    expect(parseOoxmlChart(changed, conformance)).toMatchObject({ threeD: { heightPercent: 50 }, series: [expect.objectContaining({ values: expect.objectContaining({ points: [{ index: 0, value: 2 }] }) })] });
    const automatic = parseOoxmlChart(setChartPropertyValue(changed, view, 'hPercent', 'c:CT_HPercent/c:hPercent', undefined), conformance);
    expect(automatic.status === 'supported' && automatic.threeD?.heightPercent).toBeUndefined();
  }
});
