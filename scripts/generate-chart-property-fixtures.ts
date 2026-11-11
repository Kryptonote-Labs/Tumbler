import { writeChartFixture } from './chart-fixture-writer.ts';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart, chartPropertyTree, insertChartProperty, editChartSource, type ChartPropertyNode, type ChartTrendline } from '../packages/charts/src/index.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-properties/input');
await mkdir(output, { recursive: true });
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const base = (type: 'lineChart' | 'barChart' | 'scatterChart' = 'lineChart') => text(createOoxmlChart({ type, title: 'Chart properties', categories: ['Jan', 'Feb', 'Mar', 'Apr'], series: [{ name: 'Measurements', values: [3, 5, 8, 12], xValues: [1, 2, 3, 4] }] }));
function property(xml: string, path: readonly string[], attributes: Readonly<Record<string, string>> = {}) {
  let source = new TextEncoder().encode(xml);
  const find = (node: ChartPropertyNode, name: string): ChartPropertyNode | undefined => node.name.split(':').at(-1) === name ? node : node.children.map(child => find(child, name)).find(Boolean);
  let parent = find(chartPropertyTree(source), path[0]!)!;
  for (const name of path.slice(1)) {
    let node = parent.children.find(child => child.name.split(':').at(-1) === name);
    if (!node) {
      const definition = parent.availableChildren.find(child => child.definition.endsWith(`/c:${name}`));
      if (!definition) throw new Error(`Property ${name} unavailable.`);
      const id = parent.id;
      source = insertChartProperty(source, id, definition.definition);
      parent = find(chartPropertyTree(source), path[0]!)!;
      for (const ancestor of path.slice(1, path.indexOf(name))) parent = parent.children.find(child => child.name.split(':').at(-1) === ancestor)!;
      node = parent.children.find(child => child.name.split(':').at(-1) === name)!;
    }
    parent = node;
  }
  return text(editChartSource(source, Object.entries(attributes).map(([name, value]) => ({ kind: 'attribute' as const, node: parent.id, name, value }))));
}
const inputs: { name: string; source: string }[] = [];
for (const type of ['linear', 'exp', 'log', 'poly', 'power', 'movingAvg'] satisfies ChartTrendline['type'][]) inputs.push({ name: `trend-${type}`, source: base().replace('<c:cat>', `<c:trendline><c:trendlineType val="${type}"/>${type === 'poly' ? '<c:order val="2"/>' : type === 'movingAvg' ? '<c:period val="2"/>' : ''}${type === 'movingAvg' ? '' : '<c:forward val="2"/><c:dispRSqr val="1"/><c:dispEq val="1"/>'}</c:trendline><c:cat>`) });
for (const type of ['fixedVal', 'percentage', 'stdDev', 'stdErr', 'cust']) {
  const sequence = (side: string) => `<c:${side}><c:numLit><c:formatCode>0.0</c:formatCode><c:ptCount val="4"/>${[1, 2, 1.5, 3].map((value, index) => `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`).join('')}</c:numLit></c:${side}>`;
  inputs.push({ name: `errors-${type}`, source: base().replace('<c:cat>', `<c:errBars><c:errDir val="y"/><c:errBarType val="both"/><c:errValType val="${type}"/><c:noEndCap val="0"/>${type === 'cust' ? sequence('plus') + sequence('minus') : type === 'stdErr' ? '' : `<c:val val="${type === 'percentage' ? 10 : 1}"/>`}</c:errBars><c:cat>`) });
}
inputs.push({ name: 'axis-log-reversed', source: base('scatterChart').replace(/<c:scaling>.*?<\/c:scaling>/g, '<c:scaling><c:logBase val="10"/><c:orientation val="maxMin"/></c:scaling>') });
let crossed = base('barChart');
for (const [path, attributes] of [
  [['catAx', 'majorTickMark'], { val: 'out' }], [['catAx', 'tickLblSkip'], { val: '2' }], [['catAx', 'crossesAt'], { val: '5' }],
  [['valAx', 'minorUnit'], { val: '1' }], [['valAx', 'majorTickMark'], { val: 'cross' }], [['valAx', 'minorTickMark'], { val: 'in' }], [['valAx', 'minorGridlines'], {}],
  [['valAx', 'dispUnits', 'custUnit'], { val: '10' }], [['valAx', 'dispUnits', 'dispUnitsLbl'], {}],
] as const) crossed = property(crossed, path, attributes);
inputs.push({ name: 'axis-crossing-ticks-units', source: crossed });
let dated = base().replaceAll('c:catAx', 'c:dateAx').replace('<c:strLit>', '<c:numLit><c:formatCode>mmm d</c:formatCode>').replace('</c:strLit>', '</c:numLit>').replace('<c:v>Jan</c:v>', '<c:v>45000</c:v>').replace('<c:v>Feb</c:v>', '<c:v>45001</c:v>').replace('<c:v>Mar</c:v>', '<c:v>45030</c:v>').replace('<c:v>Apr</c:v>', '<c:v>45060</c:v>');
for (const [name, attributes] of [['baseTimeUnit', { val: 'days' }], ['majorUnit', { val: '30' }], ['majorTimeUnit', { val: 'days' }], ['numFmt', { formatCode: 'mmm d', sourceLinked: '0' }]] as const) dated = property(dated, ['dateAx', name], attributes);
inputs.push({ name: 'axis-dates', source: dated });
for (const { name, source } of inputs) {
  await writeChartFixture(output, name, new TextEncoder().encode(source));
}
console.log(output);
