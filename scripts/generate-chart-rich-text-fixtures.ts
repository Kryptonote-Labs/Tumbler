import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOoxmlChart, parseOoxmlChart, updateChartTitle } from '../packages/charts/src/index.ts';
import { writeChartFixture } from './chart-fixture-writer.ts';

const output = resolve(process.argv[2] ?? 'compatibility-results/chart-rich-text/input');
await mkdir(output, { recursive: true });
for (const conformance of ['strict', 'transitional'] as const) {
  const drawing = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/drawingml/main' : 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const paragraph = `<d:p xmlns:d="${drawing}"><d:pPr><d:defRPr sz="1600"><d:latin typeface="DejaVu Sans"/></d:defRPr></d:pPr><d:r><d:t>Period </d:t></d:r><d:fld id="{1421411B-1421-1421-1421-142141214121}" type="datetime1"><d:rPr lang="en-GB" b="1"/><d:pPr marL="25400"/><d:t>Q1</d:t></d:fld><d:br><d:rPr sz="2200" i="1"/></d:br><d:r><d:t>Forecast</d:t></d:r><d:endParaRPr sz="2400" lang="fr-FR"><d:solidFill><d:schemeClr val="accent3"/></d:solidFill><d:extLst><d:ext uri="urn:chart-test"><x:keep xmlns:x="urn:field-metadata" value="retained"/></d:ext></d:extLst></d:endParaRPr></d:p>`;
  const created = createOoxmlChart({ type: 'barChart', conformance, title: 'Initial', categories: ['A', 'B', 'C'], series: [{ name: 'Data', values: [2, 4, 3] }] });
  const source = new TextEncoder().encode(new TextDecoder().decode(created)
    .replace('<c:chartSpace ', '<c:chartSpace xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:x="urn:field-metadata" mc:Ignorable="x" mc:ProcessContent="x:keep" ')
    .replace(/<a:p\b[\s\S]*?<\/a:p>/, paragraph));
  const parsed = parseOoxmlChart(source, conformance);
  const edited = updateChartTitle(source, parsed.titleText!.map(p => ({ ...p, runs: p.runs.map(run => ({ ...run, style: { ...run.style, italic: true } })) })));
  for (const [stage, bytes] of [['before', source], ['after', edited]] as const) {
    const name = `${conformance}-${stage}`;
    await Bun.write(resolve(output, `${name}.xml`), bytes);
    await writeChartFixture(output, name, bytes);
  }
}
console.log(`Four field/break/paragraph-end cases in DOCX, PPTX and XLSX: ${output}`);
