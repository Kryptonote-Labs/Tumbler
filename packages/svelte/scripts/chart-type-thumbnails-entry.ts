import { render } from 'svelte/server';
import OoxmlChart from '../src/OoxmlChart.svelte';
import { CHART_TYPE_FAMILIES } from '../src/chart-properties.ts';
import { createOoxmlChart, parseOoxmlChart, type ChartModel } from '@tumblerjs/charts';
import type { ChartTypeChange } from '../src/chart-properties.ts';

const previews = new Map<string, ChartModel>();
/** Gallery thumbnails use the actual chart renderer and a fixed, small dataset. */
export function chartTypePreview(change: ChartTypeChange): ChartModel {
  const key = JSON.stringify(change);
  const cached = previews.get(key);
  if (cached) return cached;
  const values = [
    [4, 7, 5, 8],
    [8, 10, 9, 12],
    [2, 3, 2, 4],
    [6, 8, 7, 10],
  ];
  const source = createOoxmlChart({
    ...change,
    categories: ['', '', '', ''],
    series: values.slice(0, change.type === 'stockChart' ? 4 : 3).map((values, index) => ({
      name: `Series ${index + 1}`,
      values,
      xValues: [1, 2, 3, 4],
      bubbleSizes: [2, 4, 3, 5],
    })),
  });
  const parsed = parseOoxmlChart(source, 'transitional');
  const model: ChartModel =
    parsed.status === 'supported'
      ? {
          ...parsed,
          legend: undefined,
          axes: parsed.axes.map((axis) => ({
            ...axis,
            deleted: true,
            majorGridlines: false,
            minorGridlines: false,
          })),
          plotLayout: {
            target: 'inner',
            x: 0.08,
            y: 0.08,
            width: 0.84,
            height: 0.84,
            xMode: 'edge',
            yMode: 'edge',
            widthMode: 'factor',
            heightMode: 'factor',
          },
        }
      : parsed;
  previews.set(key, model);
  return model;
}

/** Generate gallery artwork through the document renderer, outside the interaction path. */
export function thumbnails() {
  return CHART_TYPE_FAMILIES.flatMap((family) => family.options).map((option) => {
    const html = render(OoxmlChart, {
      props: {
        model: chartTypePreview(option.change),
        width: 120,
        height: 72,
        clipId: 'thumbnail',
      },
    }).body;
    const svg = html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];
    if (!svg) throw new Error(`No thumbnail rendered for ${option.label}.`);
    return {
      key: JSON.stringify(option.change, Object.keys(option.change).sort()),
      name: option.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-$/, ''),
      svg: svg
        .replace(/<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\sclass="[^"]*"/g, ''),
    };
  });
}
