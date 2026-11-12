import { mkdir } from "node:fs/promises";
import { createOoxmlChart } from "../packages/charts/src/index.ts";
import { writeChartFixture } from "./chart-fixture-writer.ts";
const out = process.argv[2] ?? "compatibility-results/chart-axis-rotation/input";
await mkdir(out, { recursive: true });
for (const angle of [0, 45, -45, 90]) {
  const source = new TextDecoder().decode(
    createOoxmlChart({
      type: "barChart",
      categories: ["Jan", "Feb", "Mar"],
      series: [{ name: "Revenue", values: [10000, 30000, 50000] }],
    }),
  );
  const font = `<c:txPr><a:bodyPr rot="${angle * 60000}"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000"><a:latin typeface="DejaVu Sans"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
  const frame =
    '<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:wMode val="factor"/><c:hMode val="factor"/><c:x val="0.2"/><c:y val="0.1"/><c:w val="0.7"/><c:h val="0.75"/></c:manualLayout></c:layout>';
  const xml = source
    .replace("<c:plotArea><c:layout/>", "<c:plotArea>" + frame)
    .replace(/<c:legend>[\s\S]*?<\/c:legend>/, "")
    .replace(
      /(<c:valAx>[\s\S]*?)(<c:crossAx)/,
      (_match: string, before: string, after: string) => before + font + after,
    );
  await Bun.write(`${out}/axis-${angle}.xml`, xml);
  await writeChartFixture(out, `axis-${angle}`, new TextEncoder().encode(xml));
}
