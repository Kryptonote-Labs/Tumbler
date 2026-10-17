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

test('chart title edits agree in native layout and DOCX export and can be undone', () => {
  const source = fixture();
  const document = new NativeWordDocument({ source });
  const content = importWordContent(source);
  const title = 'Revenue <forecast> & growth';
  document.update(content.map(block => block.kind === 'paragraph' ? { ...block, runs: block.runs.map(run => ({ ...run, chartTitle: title })) } : block));
  expect(document.drawingAt(0)).toMatchObject({ kind: 'chart', model: { title } });
  expect([...document.artifact().document.drawings.values()][0]).toMatchObject({ kind: 'chart', model: { title } });
  document.update(content);
  expect(document.drawingAt(0)).toMatchObject({ kind: 'chart', model: { title: undefined } });
  document.update(content.map(block => block.kind === 'paragraph' ? { ...block, runs: block.runs.map(run => ({ ...run, chartTitle: '' })) } : block));
  expect([...document.artifact().document.drawings.values()][0]).toMatchObject({ kind: 'chart', model: { title: '' } });
});

test('mixed chart title formatting survives native projection and DOCX export', () => {
  const source = fixture();
  const document = new NativeWordDocument({ source });
  const content = importWordContent(source);
  const chartTitleText = [{ alignment: 'center' as const, runs: [
    { text: 'Chart', format: { bold: true, color: '#C00000', fontSizePoints: 18, underline: 'single' as const } },
    { text: ' Title', format: { bold: false, italic: true, fontFamily: 'Aptos', fontSizePoints: 14 } },
  ] }];
  document.update(content.map(block => block.kind === 'paragraph' ? { ...block, runs: block.runs.map(run => ({ ...run, chartTitleText })) } : block));
  for (const drawing of [document.drawingAt(0), [...document.artifact().document.drawings.values()][0]]) {
    expect(drawing).toMatchObject({ kind: 'chart', model: { title: 'Chart Title', titleText: [{ runs: [
      { text: 'Chart', style: { bold: true, color: { value: '#C00000' }, fontSize: 18, underline: 'single' } },
      { text: ' Title', style: { bold: false, italic: true, fontFamily: 'Aptos', fontSize: 14 } },
    ] }] } });
  }
});

test('shared placement converts a painted chart between line and page bases without changing its position', async () => {
  const { wordDrawingPlacement } = await import('../src/index.ts');
  const source = fixture();
  const drawing = [...source.document.drawings.values()][0]!;
  const floating = wordDrawingPlacement(drawing, { x: 100, y: 120 }, 80, { layout: 'front' });
  expect(floating).toEqual({ layout: 'front', wrap: 'none', horizontalRelativeTo: 'page', verticalRelativeTo: 'line', x: 100, y: 40 });
  const content = importWordContent(source);
  const document = new NativeWordDocument({ source });
  const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };
  const y = () => document.layout(measure).pages.flatMap(page => page.columns.flatMap(column => column.lines.flatMap(line => line.fragments))).find(fragment => fragment.drawing)?.y;
  for (const verticalRelativeTo of ['line', 'page'] as const) {
    const geometry = { width: 144, height: 72, ...floating, verticalRelativeTo };
    const edited = content.map(block => block.kind === 'paragraph' ? { ...block, runs: block.runs.map(run => ({ ...run, drawing: geometry })) } : block);
    document.update(edited);
    const before = y()!;
    document.update([{ kind: 'paragraph', runs: [{ text: 'Before chart' }] }, ...edited]);
    expect(y()! - before).toBe(verticalRelativeTo === 'page' ? 0 : 12);
    const native = [...document.drawings.values()][0]!;
    expect([...document.artifact().document.drawings.values()][0]?.anchor).toEqual(native.anchor);
    const fixed = wordDrawingPlacement(native, { x: 100, y: 120 }, 80, { moveWithText: false });
    expect(fixed).toMatchObject({ verticalRelativeTo: 'page', x: 100, y: 120 });
    expect(wordDrawingPlacement(native, { x: 100, y: 120 }, 80, { layout: 'inline' })).toEqual({ layout: 'inline' });
  }
});

test('imported chart wrapping survives resize, and an explicit front placement clears it in native layout and export', async () => {
  const { beginPackageTransaction } = await import('@tumblerjs/opc');
  const source = fixture();
  const drawing = [...source.document.drawings.values()][0]!;
  const anchored = source.updateDrawing({ elementId: drawing.elementId, widthPoints: 72, heightPoints: 36, layout: 'front', xPoints: 100, yPoints: 120 });
  const transaction = beginPackageTransaction(anchored.document.package);
  transaction.replacePart(anchored.document.part.name, new TextEncoder().encode(anchored.document.source.source.replace('<wp:wrapNone/>', '<wp:wrapSquare wrapText="bothSides"/>')));
  const imported = openWordArtifact(transaction.commit());
  const document = new NativeWordDocument({ source: imported });
  const content = importWordContent(imported);
  for (const wrap of [undefined, 'none'] as const) {
    const geometry: WordDrawingGeometry = { width: 144, height: 72, ...(wrap ? { layout: 'front', wrap, horizontalRelativeTo: 'page', verticalRelativeTo: 'line', x: 100, y: 40 } : {}) };
    document.update(content.map(block => block.kind === 'paragraph' ? { ...block, runs: block.runs.map(run => ({ ...run, drawing: geometry })) } : block));
    expect([...document.drawings.values()][0]?.anchor?.wrap).toBe(wrap ?? 'square');
    expect([...document.artifact().document.drawings.values()][0]?.anchor).toEqual([...document.drawings.values()][0]?.anchor);
  }
});
