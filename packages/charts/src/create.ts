import { CHART_BAR_SHAPES, type ChartBarShape } from './bar-shapes.ts';
import { isOoxmlChartType, type OoxmlChartType } from './chart-types.ts';
import { updateChartTitle } from './title-edit.ts';

export interface ChartSourceSeries {
  readonly name: string;
  readonly values: readonly (number | null)[];
  readonly xValues?: readonly (number | null)[] | undefined;
  readonly bubbleSizes?: readonly (number | null)[] | undefined;
}

export interface CreateChartOptions {
  readonly type: OoxmlChartType;
  readonly shape?: ChartBarShape | undefined;
  readonly conformance?: 'strict' | 'transitional' | undefined;
  readonly title?: string | undefined;
  readonly categories: readonly string[];
  readonly series: readonly ChartSourceSeries[];
  readonly direction?: 'bar' | 'col' | undefined;
  readonly grouping?: 'standard' | 'clustered' | 'stacked' | 'percentStacked' | undefined;
  readonly radarStyle?: 'standard' | 'marker' | 'filled' | undefined;
  readonly scatterStyle?: 'none' | 'line' | 'lineMarker' | 'marker' | 'smooth' | 'smoothMarker' | undefined;
  readonly splitType?: 'pie' | 'bar' | undefined;
  readonly wireframe?: boolean | undefined;
}

function escape(value: string): string {
  if (!value.isWellFormed() || /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value)) throw new TypeError('Invalid XML text.');
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function numericData(name: string, values: readonly (number | null)[]): string {
  const points = values.flatMap((value, index) => {
    if (value === null) return [];
    if (!Number.isFinite(value)) throw new TypeError('Chart data must contain finite numbers or null for blanks.');
    return [`<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`];
  }).join('');
  return `<c:${name}><c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${points}</c:numLit></c:${name}>`;
}

function axis(kind: 'catAx' | 'valAx' | 'serAx', id: number, cross: number, position: 'b' | 'l' | 'r'): string {
  return `<c:${kind}><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="${position}"/>${kind === 'valAx' && position === 'l' ? '<c:majorGridlines/>' : ''}<c:tickLblPos val="nextTo"/><c:crossAx val="${cross}"/><c:crosses val="autoZero"/>${kind === 'valAx' ? '<c:crossBetween val="between"/>' : ''}</c:${kind}>`;
}

/** Create a standalone chart part with inline source data and theme-relative series colours.
 * Hosts attach this part to a drawing; this does not create a host drawing or an embedded workbook.
 * Creating source for a chart type does not imply renderer support for that type.
 */
export function createOoxmlChart(options: CreateChartOptions): Uint8Array {
  const { type } = options;
  for (const [value, allowed] of [
    [options.conformance, ['strict', 'transitional']],
    [options.direction, ['bar', 'col']],
    [options.grouping, ['standard', 'clustered', 'stacked', 'percentStacked']],
    [options.radarStyle, ['standard', 'marker', 'filled']],
    [options.scatterStyle, ['none', 'line', 'lineMarker', 'marker', 'smooth', 'smoothMarker']],
    [options.splitType, ['pie', 'bar']],
    [options.shape, CHART_BAR_SHAPES],
  ] as const) {
    if (value !== undefined && !allowed.some(candidate => candidate === value))
      throw new TypeError(`Invalid chart option: ${value}`);
  }
  if (!isOoxmlChartType(type)) throw new TypeError('Unknown ECMA-376 chart type.');
  if (type === 'stockChart' && ![3, 4].includes(options.series.length))
    throw new TypeError('Stock charts require three or four price series.');
  const bar = type === 'barChart' || type === 'bar3DChart';
  const line = type === 'lineChart' || type === 'line3DChart';
  const area = type === 'areaChart' || type === 'area3DChart';
  const xy = type === 'scatterChart' || type === 'bubbleChart';
  const pie = ['pieChart', 'pie3DChart', 'ofPieChart', 'doughnutChart'].includes(type);
  const depth = ['area3DChart', 'bar3DChart', 'line3DChart', 'surfaceChart', 'surface3DChart'].includes(type);
  if (options.grouping && !(bar || line || area)) throw new TypeError('Grouping does not apply to this chart type.');
  const grouping = options.grouping ?? (bar ? 'clustered' : 'standard');
  if (!bar && grouping === 'clustered')
    throw new TypeError('Invalid grouping for this chart type.');
  if (options.direction !== undefined && !bar) throw new TypeError('Direction applies only to bar charts.');
  if (options.radarStyle !== undefined && type !== 'radarChart') throw new TypeError('Radar style applies only to radar charts.');
  if (options.scatterStyle !== undefined && type !== 'scatterChart') throw new TypeError('Scatter style applies only to scatter charts.');
  if (options.splitType !== undefined && type !== 'ofPieChart') throw new TypeError('Split type applies only to of-pie charts.');
  if (options.shape !== undefined && type !== 'bar3DChart') throw new TypeError('Bar shape applies only to 3D bar and column charts.');
  if (options.wireframe !== undefined && !type.startsWith('surface')) throw new TypeError('Wireframe applies only to surface charts.');
  const series = options.series.map((series, index) => {
    if (!xy && series.values.length !== options.categories.length) throw new TypeError('Series and category counts must match.');
    for (const values of [series.xValues, series.bubbleSizes])
      if (values && values.length !== series.values.length) throw new TypeError('X, Y and bubble-size counts must match.');
    if (type === 'bubbleChart' && !series.bubbleSizes) throw new TypeError('Bubble charts require bubble sizes.');
    const color = `accent${index % 6 + 1}`;
    const style = `<c:spPr><a:solidFill><a:schemeClr val="${color}"/></a:solidFill><a:ln>${type === 'stockChart' ? '<a:noFill/>' : `<a:solidFill><a:schemeClr val="${color}"/></a:solidFill>`}</a:ln></c:spPr>`;
    const categories = `<c:cat><c:strLit><c:ptCount val="${options.categories.length}"/>${options.categories.map((value, i) => `<c:pt idx="${i}"><c:v>${escape(value)}</c:v></c:pt>`).join('')}</c:strLit></c:cat>`;
    const values = xy
      ? numericData('xVal', series.xValues ?? series.values.map((_, i) => i + 1)) + numericData('yVal', series.values) + (type === 'bubbleChart' ? numericData('bubbleSize', series.bubbleSizes!) : '')
      : categories + numericData('val', series.values);
    return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:v>${escape(series.name)}</c:v></c:tx>${style}${type === 'stockChart' ? `<c:marker><c:symbol val="${options.series.length === 3 && index === 2 ? 'dash' : 'none'}"/>${options.series.length === 3 && index === 2 ? '<c:spPr><a:ln><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:ln></c:spPr>' : ''}</c:marker>` : ''}${values}</c:ser>`;
  }).join('');
  let before = '';
  let after = '';
  if (bar) before += `<c:barDir val="${options.direction ?? 'col'}"/>`;
  if (bar || line || area) before += `<c:grouping val="${grouping}"/>`;
  if (type === 'radarChart') before += `<c:radarStyle val="${options.radarStyle ?? 'standard'}"/>`;
  if (type === 'scatterChart') before += `<c:scatterStyle val="${options.scatterStyle ?? 'marker'}"/>`;
  if (type === 'ofPieChart') before += `<c:ofPieType val="${options.splitType ?? 'pie'}"/>`;
  if (type.startsWith('surface')) before += `<c:wireframe val="${options.wireframe ? 1 : 0}"/>`;
  else if (type !== 'stockChart') before += `<c:varyColors val="${pie ? 1 : 0}"/>`;
  if (type === 'doughnutChart') after += '<c:holeSize val="50"/>';
  if (type === 'stockChart') after += '<c:hiLowLines/>' + (options.series.length === 4 ? '<c:upDownBars><c:gapWidth val="150"/><c:upBars/><c:downBars/></c:upDownBars>' : '');
  if (bar && type === 'barChart' && ['stacked', 'percentStacked'].includes(grouping)) after += '<c:overlap val="100"/>';
  if (options.shape) after += `<c:shape val="${options.shape}"/>`;
  const ids = pie ? [] : depth ? [1, 2, 3] : [1, 2];
  after += ids.map(id => `<c:axId val="${id}"/>`).join('');
  const horizontal = bar && options.direction === 'bar';
  const axes = pie ? '' : axis(xy ? 'valAx' : 'catAx', 1, 2, horizontal ? 'l' : 'b') + axis('valAx', 2, 1, horizontal ? 'b' : 'l') + (depth ? axis('serAx', 3, 2, 'r') : '');
  const strict = options.conformance === 'strict';
  const ns = strict ? 'http://purl.oclc.org/ooxml/drawingml/' : 'http://schemas.openxmlformats.org/drawingml/2006/';
  const view = type.includes('3D') ? '<c:view3D><c:rotX val="15"/><c:rotY val="20"/><c:rAngAx val="1"/></c:view3D>' : '';
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${ns}chart" xmlns:a="${ns}main"><c:chart><c:autoTitleDeleted val="1"/>${view}<c:plotArea><c:layout/><c:${type}>${before}${series}${after}</c:${type}>${axes}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  const bytes = new TextEncoder().encode(xml);
  return options.title === undefined ? bytes : updateChartTitle(bytes, options.title);
}
