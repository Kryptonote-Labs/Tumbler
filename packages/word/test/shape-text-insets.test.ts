import { expect, test } from 'bun:test';
import {
  createWordArtifact,
  importWordContent,
  isWordAuthoredShape,
  layoutWordShapeText,
  NativeWordDocument,
  openWordArtifact,
  resolveWordShapeTextInsets,
  type WordArtifact,
  type WordAuthoredShape,
} from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const shape: WordAuthoredShape = {
  preset: 'rect', width: 100, height: 60, fill: 'none', outline: 'none', outlineWidth: 0,
  text: 'Label', textAnchor: 'top',
};
const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };

function drawingShape(artifact: WordArtifact) {
  const drawing = [...artifact.document.drawings.values()][0];
  if (drawing?.kind !== 'shape') throw new Error('Expected an editable shape');
  return drawing.shape;
}

function create(value: WordAuthoredShape) {
  return createWordArtifact({ paragraphs: [{ runs: [{ text: '\uFFFC', shape: value }] }] });
}

/** Purpose-built XML fixture, independent of the text-inset writer. */
function imported(attributes: string) {
  return openWordArtifact(buildWordDocumentFixture({ documentXml: `
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
      xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
      xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
      <w:body><w:p><w:r><w:drawing><wp:inline><wp:extent cx="1270000" cy="762000"/>
        <wp:docPr id="1" name="Label"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">
          <wps:wsp><wps:cNvSpPr/><wps:spPr><a:prstGeom prst="rect"/></wps:spPr>
            <wps:txbx><w:txbxContent><w:p><w:r><w:t>Label</w:t></w:r></w:p></w:txbxContent></wps:txbx>
            <wps:bodyPr anchor="t" ${attributes}/>
          </wps:wsp>
        </a:graphicData></a:graphic>
      </wp:inline></w:drawing></w:r></w:p></w:body>
    </w:document>` }));
}

test('missing sides use DrawingML defaults, while explicit zero survives export and reauthoring', () => {
  expect(resolveWordShapeTextInsets(drawingShape(imported('')))).toEqual({ top: 3.6, right: 7.2, bottom: 3.6, left: 7.2 });
  let artifact = create({ ...shape, textInsets: { top: 0, right: 2, left: 0 } });
  for (let i = 0; i < 2; i++) {
    const current = drawingShape(openWordArtifact(artifact.bytes()));
    expect(current.textInsets).toEqual({ top: 0, right: 2, left: 0 });
    expect(resolveWordShapeTextInsets(current)).toEqual({ top: 0, right: 2, bottom: 3.6, left: 0 });
    const body = artifact.document.source.elements('http://schemas.microsoft.com/office/word/2010/wordprocessingShape', 'bodyPr')[0]!;
    const attributes = Object.fromEntries(body.attributes.map(attribute => [attribute.localName, attribute.value]));
    expect(attributes).toMatchObject({ tIns: '0', rIns: '25400', lIns: '0' });
    expect(attributes.bIns).toBeUndefined();
    artifact = createWordArtifact({ blocks: importWordContent(artifact) });
  }
});

test('imported asymmetric and signed insets reach native layout and survive a text edit', () => {
  const artifact = imported('tIns="12700" rIns="25400" bIns="38100" lIns="-50800"');
  const current = drawingShape(artifact);
  expect(current.textInsets).toEqual({ top: 1, right: 2, bottom: 3, left: -4 });
  const model = new NativeWordDocument();
  model.update(importWordContent(artifact));
  const native = [...model.drawings.values()][0];
  if (native?.kind !== 'shape') throw new Error('Expected native shape');
  expect(layoutWordShapeText(native.shape, 100, 60, measure)).toMatchObject({ x: -4, y: 1 });
  const edited = drawingShape(create({ ...current, text: 'Edited', textBody: [{ runs: [{ text: 'Edited' }] }] }));
  expect(edited.textInsets).toEqual(current.textInsets);
});

test.each(['7.2pt', '0.1in', '2.54mm', '0.254cm', '0.6pc', '0.6pi'])('reads universal inset measurement %s', raw => {
  const current = drawingShape(imported(`lIns="${raw}"`));
  expect(current.textInsets?.left).toBeCloseTo(7.2);
  expect(drawingShape(create(current)).textInsets?.left).toBeCloseTo(7.2);
});

test('integer insets accept XML Schema whitespace without accepting spaces between digits', () => {
  const current = drawingShape(imported('lIns=" 91440 " rIns="&#x9;+25400&#xA;" tIns="&#xD;-12700 " bIns=" 0 "'));
  expect(current.textInsets).toEqual({ left: 7.2, right: 2, top: -1, bottom: 0 });
  expect(drawingShape(create(current)).textInsets).toEqual(current.textInsets);
  expect(() => imported('lIns="91 440"')).toThrow('ST_Coordinate32');
});

test('shape validation follows signed 32-bit EMUs without imposing a shape-size limit', () => {
  for (const left of [0, -2, -2_147_483_648 / 12700, 2_147_483_647 / 12700]) {
    expect(isWordAuthoredShape({ ...shape, textInsets: { left } })).toBe(true);
    expect(drawingShape(create({ ...shape, textInsets: { left } })).textInsets?.left).toBeCloseTo(left);
  }
  for (const textInsets of [null, [], { left: NaN }, { top: Infinity }, { left: '0' }, { right: undefined }, { extra: 2 }, { left: 2_147_483_648 / 12700 }, { bottom: -2_147_483_649 / 12700 }]) {
    expect(isWordAuthoredShape({ ...shape, textInsets })).toBe(false);
  }
  expect(() => imported('lIns="2147483648"')).toThrow('ST_Coordinate32');
});

test('zero insets let a compact label fit on one line', () => {
  const label = { ...shape, text: '2.80' };
  const defaults = layoutWordShapeText(label, 24, 60, measure);
  const compact = layoutWordShapeText({ ...label, textInsets: { top: 0, right: 0, bottom: 0, left: 0 } }, 24, 60, measure);
  expect(defaults.lines.length).toBeGreaterThan(1);
  expect(compact.lines).toHaveLength(1);
  expect(compact).toMatchObject({ x: 0, y: 0 });
});

test.each(['top', 'center', 'bottom'] as const)('anchors text within asymmetric insets at %s', textAnchor => {
  const result = layoutWordShapeText({ ...shape, textAnchor, textInsets: { top: 5, right: 4, bottom: 13, left: 9 } }, 100, 60, measure);
  const bottom = Math.max(...result.lines.map(line => line.y + line.height));
  const free = 60 - 5 - 13 - bottom;
  expect(result.x).toBe(9);
  expect(result.y).toBeCloseTo(textAnchor === 'top' ? 5 : textAnchor === 'bottom' ? 5 + free : 5 + free / 2);
});

test('insets that consume the frame leave no visible text without changing the stored margins', () => {
  for (const textInsets of [{ left: 100 }, { top: 60 }, { right: 200, bottom: 100 }]) {
    const current = drawingShape(create({ ...shape, textInsets }));
    expect(current.textInsets).toEqual(textInsets);
    const result = layoutWordShapeText(current, 100, 60, measure);
    expect(result.lines).toEqual([]);
  }
});

test.each(['top', 'center', 'bottom'] as const)('signed insets keep late story text visible with %s anchoring', textAnchor => {
  const textBody = Array.from({ length: 160 }, (_, index) => ({
    runs: [{ text: `Line ${index}` }],
    paragraph: { spacingBeforeTwips: 0, spacingAfterTwips: 0, lineSpacing: { rule: 'exact' as const, value: 240 } },
  }));
  const result = layoutWordShapeText({ ...shape, textBody, textAnchor, textInsets: { top: -1700, right: 0, bottom: 0, left: 0 } }, 100, 60, measure);
  expect(result.lines).toHaveLength(160);
  const visible = result.lines.filter(line => result.y + line.y < 60 && result.y + line.y + line.height > 0);
  const labels = visible.map(line => line.fragments.map(fragment => fragment.text).join(''));
  expect(labels).toEqual(textAnchor === 'top'
    ? ['Line 141', 'Line 142', 'Line 143', 'Line 144', 'Line 145', 'Line 146']
    : textAnchor === 'center'
      ? ['Line 148', 'Line 149', 'Line 150', 'Line 151', 'Line 152', 'Line 153']
      : ['Line 155', 'Line 156', 'Line 157', 'Line 158', 'Line 159']);
});
