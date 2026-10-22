import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const charts: typeof import('../src/index.ts') = await import(pathToFileURL(resolve(process.argv[2] ?? '.', 'packages/charts/src/index.ts')).href);
for (const n of [1000, 5000, 10000]) {
  let indexReads = 0;
  const points = Array.from({ length: n }, (_, index) => ({ get index() { indexReads++; return index; }, value: 1 }));
  const model: import('../src/index.ts').SupportedChartModel = {
    status: 'supported', kind: 'column', grouping: 'standard', holeSize: undefined, title: undefined, legend: undefined, axes: [],
    series: [{ index: 0, order: 0, title: undefined, titleFormula: undefined, fill: undefined, line: undefined, categories: undefined,
      values: { kind: 'number', formula: undefined, formatCode: undefined, points } }],
  };
  const scene = charts.layoutChartScene(model, 300, 200);
  console.log(JSON.stringify({ n, indexReads, marks: scene.marks.length, hash: Bun.hash(JSON.stringify(scene)).toString() }));
}
