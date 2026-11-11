import { beginLosslessXmlEdit, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { isOoxmlChartType } from './chart-types.ts';
import { chartXml, chartXmlText } from './source-xml.ts';

export interface ChartEditableSequence {
  readonly values: readonly (string | number | null)[];
  readonly kind: 'string' | 'number';
  readonly formula?: string;
  readonly levels?: readonly (readonly (string | number | null)[])[];
  readonly formatCode?: string;
}
export interface ChartEditableSeries {
  readonly index: number;
  readonly name: string;
  readonly nameFormula?: string;
  readonly categories?: ChartEditableSequence | undefined;
  readonly values?: ChartEditableSequence | undefined;
  readonly xValues?: ChartEditableSequence | undefined;
  readonly bubbleSizes?: ChartEditableSequence | undefined;
}
export interface ChartEditablePlot {
  readonly type: string;
  readonly series: readonly ChartEditableSeries[];
}

/** Inspect cached source data even when the preview renderer does not support the chart type. */
export function readChartData(bytes: Uint8Array): readonly ChartEditablePlot[] {
  const { document, children, plotArea } = chartXml(bytes);
  const text = (element: LosslessXmlElement | undefined) => element && document.textContent(element);
  function sequence(container: LosslessXmlElement | undefined): ChartEditableSequence | undefined {
    if (!container) return;
    const source = children(container).find(child => ['numRef', 'strRef', 'numLit', 'strLit', 'multiLvlStrRef'].includes(child.localName));
    if (!source) return;
    const cache = children(source).find(child => ['numCache', 'strCache', 'multiLvlStrCache'].includes(child.localName)) ?? source;
    const kind = source.localName.startsWith('num') ? 'number' : 'string';
    const levels = children(cache, 'lvl');
    const points = children(levels[0] ?? cache, 'pt');
    const declared = Number(children(cache, 'ptCount')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value ?? 0);
    let count = Number.isSafeInteger(declared) && declared >= 0 ? declared : 0;
    const entries = points.map(point => {
      const index = Number(point.attributes.find(attribute => attribute.localName === 'idx')?.value);
      if (!Number.isSafeInteger(index) || index < 0) throw new TypeError('Invalid chart data index.');
      count = Math.max(count, index + 1);
      const raw = text(children(point, 'v')[0]) ?? '';
      const value = kind === 'number' ? Number(raw) : raw;
      if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Invalid numeric chart data.');
      return { index, value };
    });
    // This is materialization of an explicit requested dataset, not a product authoring cap.
    const values = new Array<string | number | null>(count);
    for (const entry of entries) values[entry.index] = entry.value;
    const formula = text(children(source, 'f')[0]);
    const formatCode = text(children(cache, 'formatCode')[0]);
    return { kind, values, ...(levels.length ? { levels: levels.map(level => {
      const values = new Array<string | number | null>(count);
      for (const point of children(level, 'pt')) {
        const index = Number(point.attributes.find(attribute => attribute.localName === 'idx')?.value);
        if (!Number.isSafeInteger(index) || index < 0 || index >= count) throw new TypeError('Invalid category level index.');
        values[index] = text(children(point, 'v')[0]) ?? '';
      }
      return values;
    }) } : {}), ...(formula === undefined ? {} : { formula }), ...(formatCode === undefined ? {} : { formatCode }) };
  }
  return children(plotArea).filter(plot => isOoxmlChartType(plot.localName)).map(plot => ({
    type: plot.localName,
    series: children(plot, 'ser').map((series, index) => {
      const title = children(series, 'tx')[0];
      const reference = title && children(title, 'strRef')[0];
      const cache = reference && children(reference, 'strCache')[0];
      const name = text(title && children(title, 'v')[0]) ?? text(cache && children(cache, 'pt')[0] && children(children(cache, 'pt')[0]!, 'v')[0]) ?? `Series ${index + 1}`;
      const nameFormula = text(reference && children(reference, 'f')[0]);
      return {
        index: Number(children(series, 'idx')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value ?? index),
        name, ...(nameFormula === undefined ? {} : { nameFormula }),
        categories: sequence(children(series, 'cat')[0]),
        values: sequence(children(series, 'val')[0] ?? children(series, 'yVal')[0]),
        xValues: sequence(children(series, 'xVal')[0]),
        bubbleSizes: sequence(children(series, 'bubbleSize')[0]),
      };
    }),
  }));
}

/** Serialize a sequence, retaining its formula and number format alongside a refreshed cache. */
export function chartSequenceXml(name: string, sequence: ChartEditableSequence): string {
  if (sequence.levels) {
    if (sequence.kind !== 'string' || sequence.formula === undefined) throw new TypeError('Hierarchical categories require a string reference.');
    const levels = [sequence.values, ...sequence.levels.slice(1)].map(values => `<c:lvl>${values.flatMap((value, index) => value == null ? [] : [`<c:pt idx="${index}"><c:v>${chartXmlText(String(value))}</c:v></c:pt>`]).join('')}</c:lvl>`).join('');
    return `<c:${name}><c:multiLvlStrRef><c:f>${chartXmlText(sequence.formula)}</c:f><c:multiLvlStrCache><c:ptCount val="${sequence.values.length}"/>${levels}</c:multiLvlStrCache></c:multiLvlStrRef></c:${name}>`;
  }
  const numeric = sequence.kind === 'number';
  const points = sequence.values.flatMap((value, index) => {
    if (value === null) return [];
    if (numeric && (typeof value !== 'number' || !Number.isFinite(value))) throw new TypeError('Numeric chart sequences require finite numbers or blank cells.');
    return [`<c:pt idx="${index}"><c:v>${chartXmlText(String(value))}</c:v></c:pt>`];
  }).join('');
  const content = `${numeric ? `<c:formatCode>${chartXmlText(sequence.formatCode ?? 'General')}</c:formatCode>` : ''}<c:ptCount val="${sequence.values.length}"/>${points}`;
  const type = numeric ? 'num' : 'str';
  const data = sequence.formula === undefined ? `<c:${type}Lit>${content}</c:${type}Lit>` : `<c:${type}Ref><c:f>${chartXmlText(sequence.formula)}</c:f><c:${type}Cache>${content}</c:${type}Cache></c:${type}Ref>`;
  return `<c:${name}>${data}</c:${name}>`;
}

/** Update existing series data only; all series formatting, extensions and chart properties survive.
 * This does not write a referenced workbook. Hosts must update those cells in the same transaction.
 */
export function updateChartData(bytes: Uint8Array, plots: readonly ChartEditablePlot[]): Uint8Array {
  const { document, namespace, children, plotArea } = chartXml(bytes);
  const original = children(plotArea).filter(plot => isOoxmlChartType(plot.localName));
  if (plots.length !== original.length) throw new TypeError('Supply every existing chart plot.');
  const previous = readChartData(bytes);
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
  if (same(previous, plots)) return bytes;
  const edit = beginLosslessXmlEdit(document);
  function patchCache(cache: LosslessXmlElement, values: readonly (string | number | null)[], numeric: boolean, hasCount = true) {
    const points = children(cache, 'pt');
    const existing = new Map(points.map(point => [Number(point.attributes.find(attribute => attribute.localName === 'idx')?.value), point]));
    for (const [index, point] of existing) {
      const value = values[index];
      if (value == null) { edit.removeElement(point); continue; }
      if (numeric && (typeof value !== 'number' || !Number.isFinite(value))) throw new TypeError('Numeric chart sequences require finite numbers or blanks.');
      const text = children(point, 'v')[0];
      if (!text) throw new TypeError('Chart cache point is missing its value.');
      if (document.textContent(text) !== String(value)) edit.setText(text, String(value));
    }
    const additions = values.flatMap((value, index) => {
      if (value == null || existing.has(index)) return [];
      if (numeric && (typeof value !== 'number' || !Number.isFinite(value))) throw new TypeError('Numeric chart sequences require finite numbers or blanks.');
      return [`<c:pt xmlns:c="${namespace}" idx="${index}"><c:v>${chartXmlText(String(value))}</c:v></c:pt>`];
    }).join('');
    const extension = children(cache, 'extLst')[0];
    if (hasCount) {
      const count = children(cache, 'ptCount')[0];
      const val = count?.attributes.find(attribute => attribute.localName === 'val');
      if (val) { if (val.value !== String(values.length)) edit.setAttribute(val, String(values.length)); }
      else {
        const markup = `<c:ptCount xmlns:c="${namespace}" val="${values.length}"/>`;
        if (count) edit.replaceElementMarkup(count, markup);
        else if (points[0] ?? extension) edit.insertMarkupBefore((points[0] ?? extension)!, markup);
        else if (cache.selfClosing) throw new TypeError('Empty chart cache must be initialized before resizing.');
        else edit.appendMarkup(cache, markup);
      }
    }
    if (additions) {
      if (extension) edit.insertMarkupBefore(extension, additions);
      else if (cache.selfClosing) edit.replaceElementMarkup(cache, `<${cache.qualified} xmlns:c="${namespace}"${cache.prefix ? ` xmlns:${cache.prefix}="${namespace}"` : ` xmlns="${namespace}"`}>${additions}</${cache.qualified}>`);
      else edit.appendMarkup(cache, additions);
    }

  }
  function patchSequence(container: LosslessXmlElement, data: ChartEditableSequence, old: ChartEditableSequence) {
    if (data.kind !== old.kind || (data.formula === undefined) !== (old.formula === undefined) || (data.levels?.length ?? 0) !== (old.levels?.length ?? 0))
      throw new TypeError('Data-only updates must retain source binding and category hierarchy.');
    const source = children(container).find(child => ['numRef', 'strRef', 'numLit', 'strLit', 'multiLvlStrRef'].includes(child.localName));
    if (!source) throw new TypeError('Chart data source is missing.');
    const formula = children(source, 'f')[0];
    if (formula && data.formula !== undefined && document.textContent(formula) !== data.formula) edit.setText(formula, data.formula);
    const cache = children(source).find(child => ['numCache', 'strCache', 'multiLvlStrCache'].includes(child.localName)) ?? (source.localName.endsWith('Lit') ? source : undefined);
    if (!cache) throw new TypeError('Chart reference has no cached data; initialize its binding first.');
    if (cache.selfClosing) {
      const start = document.source.slice(cache.startTagSpan.start, cache.startTagSpan.end).replace(/\/\s*>$/, '>');
      const points = data.values.flatMap((value, index) => value == null ? [] : [`<c:pt xmlns:c="${namespace}" idx="${index}"><c:v>${chartXmlText(String(value))}</c:v></c:pt>`]).join('');
      if (data.kind === 'number' && data.values.some(value => value !== null && (typeof value !== 'number' || !Number.isFinite(value)))) throw new TypeError('Invalid numeric chart data.');
      const format = data.formatCode === undefined ? '' : `<c:formatCode xmlns:c="${namespace}">${chartXmlText(data.formatCode)}</c:formatCode>`;
      edit.replaceElementMarkup(cache, `${start}${format}<c:ptCount xmlns:c="${namespace}" val="${data.values.length}"/>${points}</${cache.qualified}>`);
      return;
    }
    const levels = children(cache, 'lvl');
    if (levels.length) {
      levels.forEach((level, index) => patchCache(level, index === 0 ? data.values : data.levels![index]!, false, false));
      const count = children(cache, 'ptCount')[0]?.attributes.find(attribute => attribute.localName === 'val');
      if (count && count.value !== String(data.values.length)) edit.setAttribute(count, String(data.values.length));
    } else patchCache(cache, data.values, data.kind === 'number');
    if (data.formatCode !== old.formatCode) {
      const format = children(cache, 'formatCode')[0];
      if (format && data.formatCode === undefined) edit.removeElement(format);
      else if (format) edit.setText(format, data.formatCode!);
      else if (data.formatCode !== undefined) {
        const markup = `<c:formatCode xmlns:c="${namespace}">${chartXmlText(data.formatCode)}</c:formatCode>`;
        const first = children(cache)[0];
        if (first) edit.insertMarkupBefore(first, markup); else edit.appendMarkup(cache, markup);
      }
    }
  }
  original.forEach((plot, plotIndex) => {
    const replacement = plots[plotIndex]!;
    const series = children(plot, 'ser');
    if (replacement.type !== plot.localName || replacement.series.length !== series.length) throw new TypeError('Data updates must retain plot types and series counts.');
    series.forEach((element, index) => {
      const data = replacement.series[index]!;
      const oldIndex = Number(children(element, 'idx')[0]?.attributes.find(attribute => attribute.localName === 'val')?.value);
      if (data.index !== oldIndex) throw new TypeError('Retain the existing series index.');
      const before = previous[plotIndex]!.series[index]!;
      const title = children(element, 'tx')[0];
      const content = data.nameFormula === undefined ? `<c:v>${chartXmlText(data.name)}</c:v>` : `<c:strRef><c:f>${chartXmlText(data.nameFormula)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${chartXmlText(data.name)}</c:v></c:pt></c:strCache></c:strRef>`;
      const titleXml = `<c:tx xmlns:c="${namespace}">${content}</c:tx>`;
      if (data.name !== before.name || data.nameFormula !== before.nameFormula) {
      if (title && before.nameFormula !== undefined && data.nameFormula !== undefined) patchSequence(title, { kind: 'string', values: [data.name], formula: data.nameFormula }, { kind: 'string', values: [before.name], formula: before.nameFormula });
      else if (title) edit.replaceElementMarkup(title, titleXml);
      else {
        const following = children(element).find(child => !['idx', 'order'].includes(child.localName));
        if (following) edit.insertMarkupBefore(following, titleXml); else edit.appendMarkup(element, titleXml);
      }
      }
      for (const [name, sequence] of [['cat', data.categories], ['xVal', data.xValues], [children(element, 'yVal').length ? 'yVal' : 'val', data.values], ['bubbleSize', data.bubbleSizes]] as const) {
        const existing = children(element, name)[0];
        const old = name === 'cat' ? before.categories : name === 'xVal' ? before.xValues : name === 'bubbleSize' ? before.bubbleSizes : before.values;
        if (same(sequence, old)) continue;
        if (!sequence) { if (existing) edit.removeElement(existing); continue; }
        if (existing && old) patchSequence(existing, sequence, old);
        else throw new TypeError(`Cannot add ${name} through a data-only update; convert the chart type first.`);
      }
    });
  });
  return edit.commit().bytes;
}
