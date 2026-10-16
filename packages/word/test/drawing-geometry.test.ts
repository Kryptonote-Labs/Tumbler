import { expect, test } from 'bun:test';
import {
  NativeWordDocument,
  importWordContent,
  isWordDrawingGeometry,
  openWordArtifact,
  type WordDrawingGeometry,
} from '../src/index.ts';
import { validateAttributes } from '../src/collaboration/formatting.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

function fixture() {
  const c = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return openWordArtifact(
    buildWordDocumentFixture({
      documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="${c}" xmlns:r="${r}"><w:body><w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="457200"/><wp:docPr id="1" name="Chart"/><a:graphic><a:graphicData uri="${c}"><c:chart r:id="chart"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>`,
      relationships: [{ id: 'chart', type: `${r}/chart`, target: 'charts/chart1.xml' }],
      parts: [
        {
          itemName: 'word/charts/chart1.xml',
          contentType: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
          xml: `<c:chartSpace xmlns:c="${c}"><c:chart><c:plotArea><c:pieChart/></c:plotArea></c:chart></c:chartSpace>`,
        },
      ],
    }),
  );
}

for (const geometry of [
  { width: 144, height: 72 },
  { width: 144, height: 72, layout: 'front', x: 120, y: 180 },
  { width: 180, height: 90, layout: 'behind', x: -12, y: 24 },
] satisfies WordDrawingGeometry[]) {
  test(`chart geometry agrees in native layout and export: ${JSON.stringify(geometry)}`, () => {
    const source = fixture();
    const document = new NativeWordDocument({ source });
    const content = importWordContent(source);
    document.update(
      content.map((block) =>
        block.kind === 'paragraph'
          ? { ...block, runs: block.runs.map((run) => ({ ...run, drawing: geometry })) }
          : block,
      ),
    );
    const native = [...document.drawings.values()][0]!;
    expect(document.drawingAt(0)).toBe(native);
    expect(document.drawingAt(1)).toBeUndefined();
    const exported = document.artifact();
    const actual = [...exported.document.drawings.values()][0]!;
    expect(actual).toMatchObject({
      kind: 'chart',
      widthPoints: geometry.width,
      heightPoints: geometry.height,
      placement: native.placement,
      anchor: native.anchor,
    });
    const part = source.document.package.getPart('/word/charts/chart1.xml')!;
    expect(
      exported.document.package.readPart(exported.document.package.getPart(part.name)!),
    ).toEqual(source.document.package.readPart(part));
    document.update(content);
    expect([...document.drawings.values()][0]?.widthPoints).toBe(72);
    expect([...document.artifact().document.drawings.values()][0]?.widthPoints).toBe(72);
  });
}

test('collaborative drawing attributes validate geometry', () => {
  expect(() => validateAttributes({ drawing: { width: 144, height: 72 } })).not.toThrow();
  for (const patch of [
    { width: 0 },
    { height: NaN },
    { x: Infinity },
    { y: 2147483648 / 12700 },
    { layout: 'square' },
    { extra: true },
  ]) {
    const drawing = { width: 144, height: 72, ...patch };
    expect(isWordDrawingGeometry(drawing)).toBe(false);
    expect(() => validateAttributes({ drawing })).toThrow();
  }
});
