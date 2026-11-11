/** ECMA-376 Part 1 §21.2.2 plot-area chart elements. A family can have many variants. */
export const OOXML_CHART_TYPES = [
  'areaChart', 'area3DChart', 'barChart', 'bar3DChart', 'bubbleChart',
  'doughnutChart', 'lineChart', 'line3DChart', 'ofPieChart', 'pieChart',
  'pie3DChart', 'radarChart', 'scatterChart', 'stockChart', 'surfaceChart', 'surface3DChart',
] as const;
export type OoxmlChartType = typeof OOXML_CHART_TYPES[number];

export function isOoxmlChartType(name: string): name is OoxmlChartType {
  return OOXML_CHART_TYPES.some(type => type === name);
}
