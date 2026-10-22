import { expect, test } from 'bun:test';
import { beginPackageTransaction, openOpcPackage } from '../../opc/src/index.ts';
import { openPresentationDocument } from '../../slides/src/index.ts';

test('a scatter cache over the preview index limit leaves the PowerPoint document openable', async () => {
  const bytes = new Uint8Array(await Bun.file(new URL('../../../apps/docs/static/samples/workspace-brief.pptx', import.meta.url)).arrayBuffer());
  const pkg = openOpcPackage(bytes);
  const chart = pkg.parts.find(part => /\/charts\/chart\d+\.xml$/.test(part.name.value));
  expect(chart).toBeDefined();
  for (const index of [99_999, 100_000]) {
    const cache = `<c:numLit><c:pt idx="${index}"><c:v>1</c:v></c:pt></c:numLit>`;
    const xml = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:scatterChart><c:ser><c:idx val="0"/><c:order val="0"/><c:xVal>${cache}</c:xVal><c:yVal>${cache}</c:yVal></c:ser></c:scatterChart></c:plotArea></c:chart></c:chartSpace>`;
    const changed = beginPackageTransaction(pkg).replacePart(chart!.name, new TextEncoder().encode(xml)).commit();
    const doc = openPresentationDocument(changed);
    expect(doc.slides).toHaveLength(3);
    const model = doc.slides.flatMap(slide => slide.objects).find(object => object.chart)?.chart;
    expect(model?.status).toBe(index === 99_999 ? 'supported' : 'unsupported');
  }
});
