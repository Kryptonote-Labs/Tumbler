import type { Doc } from './types';

export const chartsDoc: Doc = {
  title: 'Charts',
  description: 'Read, draw and edit charts in Word, Excel and PowerPoint files with one shared engine.',
  sections: [
    { id: 'model', title: 'Read and draw a chart', blocks: [
      { kind: 'text', text: 'Charts work the same way in all three formats. `parseOoxmlChart` reads a chart\'s XML into a model, and `layoutChartScene` turns the model into a scene of shapes and text that SVG or canvas can draw.' },
      { kind: 'code', language: 'typescript', code: `import { parseOoxmlChart, layoutChartScene } from '@tumblerjs/charts';

const chart = parseOoxmlChart(chartXml, 'transitional');` },
      { kind: 'list', items: [
        'Theme colours and fonts come from the document the chart belongs to.',
        'Your code measures text and decodes any pictures the chart uses.',
        'To draw a chart in Svelte without opening a document, use the [OoxmlChart component](/components/ooxml-chart).',
      ] },
    ] },
    { id: 'types', title: 'Chart types', blocks: [
      { kind: 'text', text: 'Supported: bar and column, line, area, pie, doughnut, scatter, bubble, radar, stock, pie of pie and bar of pie, and surface. 3D charts use a shared camera and axis model.' },
      { kind: 'note', text: 'Not every chart option is supported, and charts can look slightly different from Office.' },
    ] },
    { id: 'author', title: 'Edit a chart', blocks: [
      { kind: 'text', text: 'The same chart operations insert and edit charts in DOCX, PPTX and XLSX files. The property panes in the editors and the command-line tool both use them. You can edit a chart\'s source data, formulas, axes, titles and series.' },
      { kind: 'list', items: [
        'Read the chart first. The IDs in an edit refer to the version you read, so an edit made against an older version is rejected.',
        'Parts of the chart you do not mention in an edit are kept as they are.',
        'Links to external files are kept as URLs and never fetched.',
      ] },
    ] },
    { id: 'fills', title: 'Fills and text', blocks: [
      { kind: 'text', text: 'Fills can be solid, gradient, picture, or any of the 54 built-in patterns. Changing a fill keeps the rest of the chart\'s markup unchanged.' },
      { kind: 'text', text: 'Rich titles and axis titles keep their formatting. Manually placed plot areas and legends, legend entry styles, rotated text, pie labels and leader lines are all drawn.' },
      { kind: 'note', text: 'Charts with automatic layout are placed by Tumbler\'s own rules, which can differ from Office.' },
      { kind: 'text', text: 'In the editors, the chart panel previews your changes. Apply saves them as one edit; Cancel throws them away.' },
    ] },
    { id: 'api', title: 'Testing and API', blocks: [
      { kind: 'text', text: 'Tumbler\'s tests check the charts it writes against the Office schema and convert them with LibreOffice. That shows the tested structures are valid, not that every chart looks identical to Office.' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/packages/charts/README.md', label: 'Full @tumblerjs/charts API' },
      { kind: 'link', href: '/docs/cli#charts', label: 'Edit charts from the command line' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/charts.ts',
};
