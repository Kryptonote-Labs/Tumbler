import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { isOoxmlChartType } from './chart-types.ts';
import { chartSequenceXml, type ChartEditableSeries } from './data-edit.ts';
import { chartXml, chartXmlText, standaloneChartElement } from './source-xml.ts';

export type ChartSeriesEdit =
  | { readonly action: 'add'; readonly plot?: number | undefined; readonly series: Omit<ChartEditableSeries, 'index'> }
  | { readonly action: 'duplicate' | 'remove'; readonly plot?: number | undefined; readonly series: number }
  | { readonly action: 'move'; readonly plot?: number | undefined; readonly series: number; readonly to: number };

/** Change series membership without rebuilding plots, axes, workbook references or formatting. */
export function editChartSeries(bytes: Uint8Array, input: ChartSeriesEdit): Uint8Array {
  const source = chartXml(bytes);
  const plots = source.children(source.plotArea).filter(plot => isOoxmlChartType(plot.localName));
  const plot = plots[input.plot ?? 0];
  if (!plot) throw new RangeError('Chart plot is missing.');
  const series = source.children(plot, 'ser');
  const count = series.length + (input.action === 'add' || input.action === 'duplicate' ? 1 : input.action === 'remove' ? -1 : 0);
  if (plot.localName === 'stockChart' && (count < 3 || count > 4)) throw new TypeError('ECMA-376 stock charts require three or four price series.');
  const all = plots.flatMap(plot => source.children(plot, 'ser'));
  const value = (element: typeof plot, name: string) => Number(source.children(element, name)[0]?.attributes.find(attribute => attribute.localName === 'val')?.value ?? 0);
  const reserved = new Set(all.map(element => value(element, 'idx')));
  for (const history of source.document.elements('urn:tumblerjs:chart-authoring', 'plot')) {
    const saved = parseLosslessXml(new TextEncoder().encode(source.document.textContent(history)));
    for (const series of saved.root.children) if (series.kind === 'element' && series.namespaceUri === source.namespace && series.localName === 'ser') {
      const index = series.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === source.namespace && child.localName === 'idx');
      const number = Number(index?.attributes.find(attribute => attribute.localName === 'val')?.value);
      if (Number.isInteger(number) && number >= 0) reserved.add(number);
    }
  }
  let nextIndex = 0;
  for (const index of reserved) nextIndex = Math.max(nextIndex, index + 1);
  if (nextIndex > 4294967295) { nextIndex = 0; while (reserved.has(nextIndex)) nextIndex++; }
  if (nextIndex > 4294967295) throw new RangeError('No unused chart series identity remains.');
  const nextOrder = all.reduce((maximum, element) => Math.max(maximum, value(element, 'order')), -1) + 1;
  const edit = beginLosslessXmlEdit(source.document);
  const insert = (markup: string) => {
    const following = source.children(plot).find(child => !['barDir', 'grouping', 'radarStyle', 'scatterStyle', 'ofPieType', 'wireframe', 'varyColors', 'ser'].includes(child.localName));
    if (following) edit.insertMarkupBefore(following, markup);
    else if (plot.selfClosing) edit.replaceElementMarkup(plot, source.markup(plot).replace(/\/\s*>$/, '>') + markup + `</${plot.qualified}>`);
    else edit.appendMarkup(plot, markup);
  };
  if (input.action === 'add') {
    const data = input.series;
    const xy = plot.localName === 'scatterChart' || plot.localName === 'bubbleChart';
    if (!data.values || xy && !data.xValues || plot.localName === 'bubbleChart' && !data.bubbleSizes)
      throw new TypeError('Supply the value, X and size sequences required by this chart type.');
    if (data.values.kind !== 'number' || data.bubbleSizes && data.bubbleSizes.kind !== 'number') throw new TypeError('Values and bubble sizes require numeric sequences.');
    if (xy && data.categories || !xy && data.xValues || data.bubbleSizes && plot.localName !== 'bubbleChart') throw new TypeError('This data role does not belong to the chart type.');
    const name = data.nameFormula === undefined ? `<c:v>${chartXmlText(data.name)}</c:v>`
      : `<c:strRef><c:f>${chartXmlText(data.nameFormula)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${chartXmlText(data.name)}</c:v></c:pt></c:strCache></c:strRef>`;
    const sequences = xy ? chartSequenceXml('xVal', data.xValues!) + chartSequenceXml('yVal', data.values)
      + (data.bubbleSizes ? chartSequenceXml('bubbleSize', data.bubbleSizes) : '')
      : (data.categories ? chartSequenceXml('cat', data.categories) : '') + chartSequenceXml('val', data.values);
    insert(`<c:ser xmlns:c="${source.namespace}"><c:idx val="${nextIndex}"/><c:order val="${nextOrder}"/><c:tx>${name}</c:tx>${sequences}</c:ser>`);
  } else {
    const element = series[input.series];
    if (!element) throw new RangeError('Chart series is missing.');
    if (input.action === 'remove') edit.removeElement(element);
    else if (input.action === 'duplicate') {
      const duplicate = parseLosslessXml(new TextEncoder().encode(standaloneChartElement(source.document, element)));
      const copy = beginLosslessXmlEdit(duplicate);
      for (const [name, number] of [['idx', nextIndex], ['order', nextOrder]] as const) {
        const identity = duplicate.root.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === source.namespace && child.localName === name);
        const attribute = identity?.attributes.find(attribute => attribute.localName === 'val');
        if (!attribute) throw new TypeError('Series identity is missing.');
        copy.setAttribute(attribute, String(number));
      }
      insert(new TextDecoder().decode(copy.commit().bytes));
    } else if (input.action === 'move') {
      if (!Number.isInteger(input.to) || input.to < 0 || input.to >= series.length) throw new RangeError('Series position is out of range.');
      if (input.to === input.series) return bytes;
      const ordered = [...series];
      ordered.splice(input.series, 1);
      ordered.splice(input.to, 0, element);
      const orders = series.map(element => value(element, 'order')).sort((left, right) => left - right);
      // Each destination keeps its surrounding whitespace and unrelated properties.
      series.forEach((destination, index) => {
        const original = ordered[index]!;
        const order = source.children(original, 'order')[0];
        const attribute = order?.attributes.find(attribute => attribute.localName === 'val');
        if (!attribute) throw new TypeError('Series order is missing.');
        const standalone = parseLosslessXml(new TextEncoder().encode(standaloneChartElement(source.document, original)));
        const orderNode = standalone.root.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === source.namespace && child.localName === 'order');
        const orderAttribute = orderNode?.attributes.find(attribute => attribute.localName === 'val');
        if (!orderAttribute) throw new TypeError('Series order is missing.');
        const reordered = beginLosslessXmlEdit(standalone);
        reordered.setAttribute(orderAttribute, String(orders[index]));
        edit.replaceElementMarkup(destination, new TextDecoder().decode(reordered.commit().bytes));
      });
    }
  }
  return edit.commit().bytes;
}
