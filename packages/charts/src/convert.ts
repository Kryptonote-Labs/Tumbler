import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { createOoxmlChart, type CreateChartOptions } from './create.ts';
import { readChartData } from './data-edit.ts';
import { chartPropertyTree, chartPropertyDefinition, type ChartPropertyNode } from './properties.ts';
import { chartXml, chartXmlText } from './source-xml.ts';
import { isOoxmlChartType } from './chart-types.ts';

export type ChartTypeChange = Pick<CreateChartOptions, 'type' | 'direction' | 'grouping' | 'radarStyle' | 'scatterStyle' | 'splitType' | 'wireframe'>;
const HISTORY_NS = 'urn:tumblerjs:chart-authoring';
const IDENTITY_URI = 'https://tumblerjs.org/chart-authoring/plot-identity/v1';
const HISTORY_URI = 'https://tumblerjs.org/chart-authoring/type-history/v1';

/** Capture namespace bindings so moved or temporarily inactive properties remain self-contained. */
function standalone(document: LosslessXmlDocument, element: LosslessXmlElement): string {
  const bindings = new Map<string, string>();
  let ancestor: LosslessXmlElement | undefined = document.root;
  while (ancestor) {
    for (const attribute of ancestor.attributes) if (attribute.namespaceUri === 'http://www.w3.org/2000/xmlns/') bindings.set(attribute.qualified, attribute.value);
    if (ancestor.id === element.id) break;
    ancestor = ancestor.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.span.start <= element.span.start && child.span.end >= element.span.end);
  }
  const own = new Set(element.attributes.filter(attribute => attribute.namespaceUri === 'http://www.w3.org/2000/xmlns/').map(attribute => attribute.qualified));
  const declarations = [...bindings].filter(([name]) => !own.has(name)).map(([name, value]) => ` ${name}="${chartXmlText(value)}"`).join('');
  const source = document.source.slice(element.span.start, element.span.end);
  const offset = element.startTagSpan.end - element.span.start - (element.selfClosing ? 2 : 1);
  return source.slice(0, offset) + declarations + source.slice(offset);
}
function renamed(document: LosslessXmlDocument, element: LosslessXmlElement, name: string): string {
  const xml = standalone(document, element);
  const qualified = element.prefix ? `${element.prefix}:${name}` : name;
  return xml.replace(new RegExp(`^<${element.qualified}(?=[\\s/>])`), `<${qualified}`).replace(new RegExp(`</${element.qualified}>$`), `</${qualified}>`);
}
function findNode(node: ChartPropertyNode, id: number): ChartPropertyNode | undefined { return node.id === id ? node : node.children.map(child => findNode(child, id)).find(Boolean); }

/** Convert one plot while retaining data, compatible formatting and inactive type settings.
 * An inactive plot snapshot lives in the chart's extension list, so switching back
 * can restore settings that the intervening plot schema cannot represent.
 */
export function convertChartType(bytes: Uint8Array, change: ChartTypeChange, plotIndex = 0): Uint8Array {
  const source = chartXml(bytes);
  const plots = source.children(source.plotArea).filter(plot => isOoxmlChartType(plot.localName));
  const original = plots[plotIndex];
  const data = readChartData(bytes)[plotIndex];
  if (!original || !data) throw new RangeError('Chart plot is missing.');
  const count = Math.max(0, ...data.series.map(series => Math.max(series.values?.values.length ?? 0, series.categories?.values.length ?? 0, series.xValues?.values.length ?? 0)));
  const categories = data.series[0]?.categories?.values ?? data.series[0]?.xValues?.values ?? [];
  const numeric = (values: readonly (string | number | null)[] | undefined) => Array.from({ length: count }, (_, i) => typeof values?.[i] === 'number' ? values[i] as number : null);
  const created = chartXml(createOoxmlChart({
    ...change, conformance: source.namespace.includes('purl.oclc.org') ? 'strict' : 'transitional',
    categories: Array.from({ length: count }, (_, index) => String(categories[index] ?? index + 1)),
    series: data.series.map(series => ({ name: series.name, values: numeric(series.values?.values),
      xValues: series.xValues ? numeric(series.xValues.values) : Array.from({ length: count }, (_, index) => index + 1),
      bubbleSizes: series.bubbleSizes ? numeric(series.bubbleSizes.values) : Array.from({ length: count }, () => 1) })),
  }));
  const target = created.children(created.plotArea).find(plot => isOoxmlChartType(plot.localName))!;
  const properties = findNode(chartPropertyTree(created.document.originalBytes()), target.id)!;
  const historyContainer = source.children(source.document.root, 'extLst')[0];
  const historyExtension = historyContainer?.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.attributes.some(attribute => attribute.localName === 'uri' && attribute.value === HISTORY_URI));
  const identity = source.document.elements(HISTORY_NS, 'identity').find(element => element.span.start >= original.span.start && element.span.end <= original.span.end);
  const plotId = identity?.attributes.find(attribute => attribute.localName === 'id')?.value ?? crypto.randomUUID();
  const histories = new Map<string, string>();
  if (historyExtension) for (const entry of source.document.elements(HISTORY_NS, 'plot').filter(entry => entry.span.start > historyExtension.span.start && entry.span.end < historyExtension.span.end)) {
    const type = entry.attributes.find(attribute => attribute.localName === 'type')?.value;
    const id = entry.attributes.find(attribute => attribute.localName === 'plot')?.value ?? (plots.length === 1 ? plotId : undefined);
    if (type && id) histories.set(`${id}/${type}`, source.document.textContent(entry));
  }
  const archivedXml = histories.get(`${plotId}/${change.type}`);
  const archived = archivedXml ? parseLosslessXml(new TextEncoder().encode(archivedXml)) : undefined;
  histories.set(`${plotId}/${original.localName}`, standalone(source.document, original));
  const elementChildren = (element: LosslessXmlElement | undefined) => element?.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === source.namespace) ?? [];
  const currentSeries = source.children(original, 'ser');
  const archivedSeries = elementChildren(archived?.root).filter(child => child.localName === 'ser');
  const overrides = new Set<string>(['ser', 'axId']);
  if (change.direction !== undefined) overrides.add('barDir');
  if (change.grouping !== undefined) overrides.add('grouping');
  if (change.radarStyle !== undefined) overrides.add('radarStyle');
  if (change.scatterStyle !== undefined) overrides.add('scatterStyle');
  if (change.splitType !== undefined) overrides.add('ofPieType');
  if (change.wireframe !== undefined) overrides.add('wireframe');
  const readChildren = (document: LosslessXmlDocument, element: LosslessXmlElement | undefined) => ({ document, children: elementChildren(element) });
  function merge(template: LosslessXmlElement, definition: ChartPropertyNode, current: LosslessXmlElement | undefined, saved: LosslessXmlElement | undefined, series = false): string {
    const allowed = definition.definition ? chartPropertyDefinition(definition.definition)?.children ?? [] : [];
    const originalChildren = readChildren(source.document, current), archivedChildren = archived ? readChildren(archived, saved) : undefined;
    const fresh = created.children(template);
    const names = [...new Set(allowed.map(name => chartPropertyDefinition(name)?.name.split(':').at(-1)).filter((name): name is string => !!name))];
    const content = names.flatMap(name => {
      const generated = fresh.filter(child => child.localName === name);
      if (!series && overrides.has(name)) {
        if (name === 'ser') return generated.map((element, index) => merge(element, findNode(properties, element.id)!, currentSeries[index], archivedSeries[index], true));
        return generated.map(element => standalone(created.document, element));
      }
      const role = (name === 'val' || name === 'yVal') ? ['val', 'yVal'] : [name];
      let candidates = originalChildren.children.filter(child => role.includes(child.localName));
      if (series && name === 'xVal' && !candidates.length) candidates = originalChildren.children.filter(child => child.localName === 'cat' && elementChildren(child).some(child => child.localName.startsWith('num')));
      let document = source.document;
      if (!candidates.length && archivedChildren) { candidates = archivedChildren.children.filter(child => role.includes(child.localName)); document = archivedChildren.document; }
      if (series && name === 'cat' && !candidates.length) candidates = originalChildren.children.filter(child => child.localName === 'xVal');
      if (candidates.length) {
        // Grouping is type-specific even though its element name is shared.
        if (!series && name === 'grouping') {
          const value = candidates[0]!.attributes.find(attribute => attribute.localName === 'val')?.value;
          if (change.type.startsWith('bar') && value === 'standard' || !change.type.startsWith('bar') && value === 'clustered') return generated.map(element => standalone(created.document, element));
        }
        return candidates.map(element => element.localName === name ? standalone(document, element) : renamed(document, element, name));
      }
      return generated.map(element => standalone(created.document, element));
    }).join('');
    return `<c:${template.localName} xmlns:c="${source.namespace}">${content}</c:${template.localName}>`;
  }
  let converted = merge(target, properties, original, archived?.root);
  const edit = beginLosslessXmlEdit(source.document);
  // Reuse compatible axes so bounds, number formats and text styling survive.
  const axes = source.children(source.plotArea).filter(element => ['catAx', 'valAx', 'dateAx', 'serAx'].includes(element.localName));
  let nextId = Math.max(0, ...axes.map(axis => Number(source.children(axis, 'axId')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value ?? 0))) + 1;
  const generatedAxes = created.children(created.plotArea).filter(element => ['catAx', 'valAx', 'serAx'].includes(element.localName));
  const originalAxisIds = source.children(original, 'axId').map(axis => Number(axis.attributes.find(attribute => attribute.localName === 'val')?.value));
  const archivedAxisIds = elementChildren(archived?.root).filter(axis => axis.localName === 'axId').map(axis => Number(axis.attributes.find(attribute => attribute.localName === 'val')?.value));
  const archivedAxes = archivedAxisIds.map(id => axes.find(axis => Number(source.children(axis, 'axId')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value) === id));
  const otherAxisIds = new Set(plots.filter(plot => plot !== original).flatMap(plot => source.children(plot, 'axId').map(axis => Number(axis.attributes.find(attribute => attribute.localName === 'val')?.value))));
  const originalAxes = originalAxisIds.map(id => axes.find(axis => Number(source.children(axis, 'axId')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value) === id));
  const used = new Set<number>();
  const mapping = new Map<number, number>();
  const additions: string[] = [];
  for (const axis of generatedAxes) {
    const originalId = Number(created.children(axis, 'axId')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value);
    const position = created.children(axis, 'axPos')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value;
    const owned = originalAxes[generatedAxes.indexOf(axis)];
    const savedAxis = archivedAxes[generatedAxes.indexOf(axis)];
    const existing = owned?.localName === axis.localName && !used.has(owned.id) ? owned : savedAxis?.localName === axis.localName && !used.has(savedAxis.id) ? savedAxis : axes.find(candidate => !originalAxisIds.length && !otherAxisIds.has(Number(source.children(candidate, 'axId')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value)) && candidate.localName === axis.localName && !used.has(candidate.id) && source.children(candidate, 'axPos')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value === position);
    if (existing) {
      used.add(existing.id);
      mapping.set(originalId, Number(source.children(existing, 'axId')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value));
    } else { mapping.set(originalId, nextId++); additions.push(standalone(created.document, axis)); }
  }
  const remap = (xml: string) => {
    const document = parseLosslessXml(new TextEncoder().encode(xml)), edit = beginLosslessXmlEdit(document);
    for (const element of document.elements(source.namespace)) if (['axId', 'crossAx'].includes(element.localName)) {
      const val = element.attributes.find(attribute => attribute.localName === 'val');
      const mapped = val && mapping.get(Number(val.value));
      if (val && mapped !== undefined) edit.setAttribute(val, String(mapped));
    }
    return new TextDecoder().decode(edit.commit().bytes);
  };
  for (const axis of generatedAxes) {
    const id = Number(created.children(axis, 'axId')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value);
    const cross = Number(created.children(axis, 'crossAx')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value);
    const existing = axes.find(axis => Number(source.children(axis, 'axId')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value) === mapping.get(id));
    const reference = existing && source.children(existing, 'crossAx')[0]?.attributes.find(attribute => attribute.localName === 'val');
    const targetId = mapping.get(cross);
    if (reference && targetId !== undefined && reference.value !== String(targetId)) edit.setAttribute(reference, String(targetId));
  }
  {
    const document = parseLosslessXml(new TextEncoder().encode(converted));
    if (!document.elements(HISTORY_NS, 'identity').length) {
      const edit = beginLosslessXmlEdit(document);
      const ext = document.root.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === source.namespace && child.localName === 'extLst');
      const content = `<c:ext xmlns:c="${source.namespace}" uri="${IDENTITY_URI}"><tb:identity xmlns:tb="${HISTORY_NS}" id="${plotId}"/></c:ext>`;
      if (ext && !ext.selfClosing) edit.appendMarkup(ext, content);
      else if (ext) edit.replaceElementMarkup(ext, `<c:extLst xmlns:c="${source.namespace}">${content}</c:extLst>`);
      else edit.appendMarkup(document.root, `<c:extLst xmlns:c="${source.namespace}">${content}</c:extLst>`);
      converted = new TextDecoder().decode(edit.commit().bytes);
    }
  }
  converted = remap(converted);
  edit.replaceElementMarkup(original, converted);
  for (const axis of additions) {
    const extension = source.children(source.plotArea, 'extLst')[0];
    if (extension) edit.insertMarkupBefore(extension, remap(axis)); else edit.appendMarkup(source.plotArea, remap(axis));
  }
  if (change.type.includes('3D') && !source.children(source.chart, 'view3D').length) {
    const view = created.children(created.chart, 'view3D')[0];
    if (view) edit.insertMarkupBefore(source.plotArea, standalone(created.document, view));
  }
  const history = `<c:ext xmlns:c="${source.namespace}" uri="${HISTORY_URI}"><tb:history xmlns:tb="${HISTORY_NS}">${[...histories].map(([key, xml]) => { const [plot, type] = key.split('/'); return `<tb:plot plot="${chartXmlText(plot!)}" type="${chartXmlText(type!)}">${chartXmlText(xml)}</tb:plot>`; }).join('')}</tb:history></c:ext>`;
  if (historyExtension) edit.replaceElementMarkup(historyExtension, history);
  else if (historyContainer && !historyContainer.selfClosing) edit.appendMarkup(historyContainer, history);
  else if (historyContainer) edit.replaceElementMarkup(historyContainer, `<c:extLst xmlns:c="${source.namespace}">${history}</c:extLst>`);
  else edit.appendMarkup(source.document.root, `<c:extLst xmlns:c="${source.namespace}">${history}</c:extLst>`);
  return edit.commit().bytes;
}
