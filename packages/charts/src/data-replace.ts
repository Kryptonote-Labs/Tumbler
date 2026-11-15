import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { bindChartData } from './data-binding.ts';
import { readChartData, chartSequenceXml, type ChartEditablePlot } from './data-edit.ts';
import { editChartSeries } from './series-edit.ts';
import { isOoxmlChartType } from './chart-types.ts';
import { chartXml, chartXmlText } from './source-xml.ts';

/** Select a new dataset, retaining existing series formatting and chart-level settings. */
export function replaceChartData(
  bytes: Uint8Array,
  data: readonly ChartEditablePlot[],
): Uint8Array {
  let source = bytes;
  const original = readChartData(source);
  if (
    original.length !== data.length ||
    original.some((plot, index) => plot.type !== data[index]?.type)
  )
    throw new Error('Select data for each chart group using its existing type.');
  for (const [plot, next] of data.entries()) {
    let count = readChartData(source)[plot]!.series.length;
    while (count > next.series.length)
      source = editChartSeries(source, { action: 'remove', plot, series: --count });
    while (count < next.series.length)
      source = editChartSeries(source, { action: 'add', plot, series: next.series[count++]! });
  }
  try {
    return bindChartData(source, data);
  } catch {
    // A different category role or reference/literal shape needs a native source replacement.
  }
  const xml = chartXml(source),
    edit = beginLosslessXmlEdit(xml.document);
  const plots = xml.children(xml.plotArea).filter((node) => isOoxmlChartType(node.localName));
  plots.forEach((plot, p) =>
    xml.children(plot, 'ser').forEach((series, s) => {
      const next = data[p]!.series[s]!;
      const name =
        next.nameFormula === undefined
          ? `<c:v>${chartXmlText(next.name)}</c:v>`
          : `<c:strRef><c:f>${chartXmlText(next.nameFormula)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${chartXmlText(next.name)}</c:v></c:pt></c:strCache></c:strRef>`;
      const title = `<c:tx xmlns:c="${xml.namespace}">${name}</c:tx>`;
      const existingTitle = xml.children(series, 'tx')[0];
      if (existingTitle) edit.replaceElementMarkup(existingTitle, title);
      else {
        const following = xml
          .children(series)
          .find((node) => !['idx', 'order'].includes(node.localName));
        if (following) edit.insertMarkupBefore(following, title);
        else edit.appendMarkup(series, title);
      }
      const xy = plot.localName === 'scatterChart' || plot.localName === 'bubbleChart';
      const roles = xy
        ? ([
            ['xVal', next.xValues],
            ['yVal', next.values],
            ['bubbleSize', next.bubbleSizes],
          ] as const)
        : ([
            ['cat', next.categories],
            ['val', next.values],
          ] as const);
      let appended = '';
      for (const [name, sequence] of roles) {
        const current = xml.children(series, name)[0];
        const markup = sequence
          ? chartSequenceXml(name, sequence).replace(
              `<c:${name}>`,
              `<c:${name} xmlns:c="${xml.namespace}">`,
            )
          : '';
        if (current) {
          if (markup) edit.replaceElementMarkup(current, markup);
          else edit.removeElement(current);
        } else appended += markup;
      }
      if (appended) {
        const following = xml
          .children(series)
          .find((node) => ['smooth', 'shape', 'extLst'].includes(node.localName));
        if (following) edit.insertMarkupBefore(following, appended);
        else edit.appendMarkup(series, appended);
      }
    }),
  );
  return edit.commit().bytes;
}
