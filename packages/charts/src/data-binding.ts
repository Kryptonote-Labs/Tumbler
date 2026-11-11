import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { chartXml, chartXmlText } from './source-xml.ts';
import { readChartData, updateChartData, type ChartEditablePlot } from './data-edit.ts';
import { isOoxmlChartType } from './chart-types.ts';

/** Bind literal caches to workbook ranges while retaining cache attributes and extensions. */
export function bindChartData(bytes: Uint8Array, data: readonly ChartEditablePlot[]): Uint8Array {
  const source = chartXml(bytes);
  const plots = source.children(source.plotArea).filter(plot => isOoxmlChartType(plot.localName));
  if (plots.length !== data.length) throw new TypeError('Supply every chart plot.');
  const edit = beginLosslessXmlEdit(source.document);
  plots.forEach((plot, plotIndex) => {
    const series = source.children(plot, 'ser');
    if (data[plotIndex]?.type !== plot.localName || data[plotIndex]?.series.length !== series.length) throw new TypeError('Bindings must retain existing chart plots and series.');
    series.forEach((element, seriesIndex) => {
      const replacement = data[plotIndex]!.series[seriesIndex]!;
      const sequences = [
        ...([['cat', replacement.categories], ['xVal', replacement.xValues], [source.children(element, 'yVal').length ? 'yVal' : 'val', replacement.values], ['bubbleSize', replacement.bubbleSizes]] as const).map(([name, sequence]) => ({ container: source.children(element, name)[0], sequence })),
        ...source.children(element, 'errBars').flatMap((errors, index) => (['plus', 'minus'] as const).map(side => ({ container: source.children(errors, side)[0], sequence: replacement.errorBars?.[index]?.[side] }))),
      ];
      for (const { container, sequence } of sequences) {
        if (sequence?.formula === undefined) continue;
        const literal = container && source.children(container).find(child => child.localName === 'numLit' || child.localName === 'strLit');
        if (!literal) continue;
        const kind = literal.localName === 'numLit' ? 'num' : 'str';
        const qualified = literal.prefix ? `${literal.prefix}:${kind}Cache` : `${kind}Cache`;
        const cache = source.markup(literal).replace(`<${literal.qualified}`, `<${qualified}`).replace(`</${literal.qualified}>`, `</${qualified}>`);
        edit.replaceElementMarkup(literal, `<c:${kind}Ref xmlns:c="${source.namespace}"><c:f>${chartXmlText(sequence.formula)}</c:f>${cache}</c:${kind}Ref>`);
      }
    });
  });
  return updateChartData(edit.commit().bytes, data);
}
