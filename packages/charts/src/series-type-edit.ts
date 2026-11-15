import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { convertChartType, type ChartTypeChange } from './convert.ts';
import { isOoxmlChartType } from './chart-types.ts';
import { chartXml, standaloneChartElement } from './source-xml.ts';

/** Move a series into a combo-chart group, retaining its identity, style, bindings and axis settings. */
export function changeChartSeriesType(
  bytes: Uint8Array,
  input: ChartTypeChange & {
    readonly plot: number;
    readonly series: number;
    readonly secondaryAxis: boolean;
  },
): Uint8Array {
  const source = chartXml(bytes);
  const plots = source.children(source.plotArea).filter((node) => isOoxmlChartType(node.localName));
  const plot = plots[input.plot];
  const series = plot && source.children(plot, 'ser')[input.series];
  if (!plot || !series) throw new Error('Select a chart series again.');
  if (!['barChart', 'lineChart', 'areaChart'].includes(input.type))
    throw new Error('Choose a column, bar, line or area type for a combination chart.');
  const converted = chartXml(convertChartType(bytes, input, input.plot));
  const convertedPlot = converted
    .children(converted.plotArea)
    .filter((node) => isOoxmlChartType(node.localName))[input.plot]!;
  const axisId = (node: LosslessXmlElement) =>
    node.attributes.find((attribute) => attribute.localName === 'val')?.value;
  const convertedIds = converted.children(convertedPlot, 'axId').map(axisId);
  const convertedAxes = convertedIds
    .map((id) =>
      converted
        .children(converted.plotArea)
        .find(
          (node) =>
            ['catAx', 'dateAx', 'valAx'].includes(node.localName) &&
            id === axisId(converted.children(node, 'axId')[0]!),
        ),
    )
    .filter((node): node is LosslessXmlElement => !!node);
  if (convertedAxes.length !== 2)
    throw new Error('This series does not have a two-axis chart layout.');
  const axes = source
    .children(source.plotArea)
    .filter((node) => ['catAx', 'dateAx', 'valAx', 'serAx'].includes(node.localName));
  const oldIds = source.children(plot, 'axId').map(axisId);
  const findAxes = (candidate: LosslessXmlElement) =>
    source
      .children(candidate, 'axId')
      .map((node) =>
        axes.find((axis) => axisId(source.children(axis, 'axId')[0]!) === axisId(node)),
      );
  const secondary = (candidate: LosslessXmlElement) =>
    findAxes(candidate).some(
      (axis) =>
        axis?.localName === 'valAx' &&
        ['r', 't'].includes(axisId(source.children(axis, 'axPos')[0]!) ?? ''),
    );
  const reusable = plots.find(
    (candidate) =>
      secondary(candidate) === input.secondaryAxis &&
      findAxes(candidate).length === 2 &&
      findAxes(candidate).every(
        (axis, index) => axis?.localName === convertedAxes[index]?.localName,
      ),
  );
  let ids = reusable ? source.children(reusable, 'axId').map(axisId) : undefined;
  const newAxes: string[] = [];
  if (!ids) {
    let nextId =
      Math.max(0, ...axes.map((axis) => Number(axisId(source.children(axis, 'axId')[0]!)))) + 1;
    ids = convertedAxes.map(() => String(nextId++));
    convertedAxes.forEach((axis, index) => {
      const copy = parseLosslessXml(
        new TextEncoder().encode(standaloneChartElement(converted.document, axis)),
      );
      const edit = beginLosslessXmlEdit(copy);
      const set = (name: string, value: string) => {
        const node = copy.root.children.find(
          (node): node is LosslessXmlElement => node.kind === 'element' && node.localName === name,
        );
        const attribute = node?.attributes.find((attribute) => attribute.localName === 'val');
        if (attribute) edit.setAttribute(attribute, value);
      };
      set('axId', ids![index]!);
      set('crossAx', ids![1 - index]!);
      const position = axisId(converted.children(axis, 'axPos')[0]!);
      set(
        'axPos',
        position === 'l' || position === 'r'
          ? input.secondaryAxis
            ? 'r'
            : 'l'
          : input.secondaryAxis
            ? 't'
            : 'b',
      );
      if (input.secondaryAxis) {
        // Secondary category coordinates share the categories without duplicate visible labels.
        if (axis.localName !== 'valAx') set('delete', '1');
      }
      newAxes.push(new TextDecoder().decode(edit.commit().bytes));
    });
  }
  const template = parseLosslessXml(
    new TextEncoder().encode(standaloneChartElement(converted.document, convertedPlot)),
  );
  const groupEdit = beginLosslessXmlEdit(template);
  const seriesNodes = template.root.children.filter(
    (node): node is LosslessXmlElement => node.kind === 'element' && node.localName === 'ser',
  );
  for (const [index, node] of seriesNodes.entries())
    if (index !== input.series) groupEdit.removeElement(node);
  const references = template.root.children.filter(
    (node): node is LosslessXmlElement => node.kind === 'element' && node.localName === 'axId',
  );
  references.forEach((node, index) => {
    const value = node.attributes.find((attribute) => attribute.localName === 'val');
    if (value) groupEdit.setAttribute(value, ids![index]!);
  });
  const edit = beginLosslessXmlEdit(source.document);
  const remaining = source.children(plot, 'ser').length > 1;
  if (remaining) edit.removeElement(series);
  else edit.removeElement(plot);
  const firstAxis = source
    .children(source.plotArea)
    .find((node) => ['catAx', 'dateAx', 'valAx', 'serAx'].includes(node.localName));
  const markup = new TextDecoder().decode(groupEdit.commit().bytes);
  if (firstAxis) edit.insertMarkupBefore(firstAxis, markup);
  else edit.appendMarkup(source.plotArea, markup);
  if (newAxes.length) {
    const following = source
      .children(source.plotArea)
      .find((node) => ['dTable', 'spPr', 'extLst'].includes(node.localName));
    if (following) edit.insertMarkupBefore(following, newAxes.join(''));
    else edit.appendMarkup(source.plotArea, newAxes.join(''));
  }
  // Remove only axes orphaned by the moved group; shared axes and unrelated groups stay untouched.
  const used = new Set([
    ...plots
      .filter((candidate) => candidate !== plot || remaining)
      .flatMap((candidate) => source.children(candidate, 'axId').map(axisId)),
    ...ids,
  ]);
  for (const axis of axes)
    if (
      oldIds.includes(axisId(source.children(axis, 'axId')[0]!)) &&
      !used.has(axisId(source.children(axis, 'axId')[0]!))
    )
      edit.removeElement(axis);
  return edit.commit().bytes;
}
