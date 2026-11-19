import { expect, test } from 'bun:test';
import {
  applyPresentationCommand as apply,
  createPresentation,
  importNativePresentation,
  openPresentationArtifact,
} from '../src/index.ts';

const insert = (path: unknown) => {
  const deck = importNativePresentation(createPresentation());
  return apply(deck, {
    name: 'insert-object',
    slideId: deck.document.slides[0]!.id,
    bounds: { x: 100, y: 100, width: 128, height: 128 },
    object: { kind: 'shape', path, fill: '#BF4E36' } as never,
  });
};

test('SVG path shapes export as editable custom geometry with arcs as curves', () => {
  // A ring: two arcs per circle, the inner circle drawn in the opposite direction.
  const ring =
    'M128,24a104,104,0,1,0,104,104A104,104,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88,88,0,0,1,128,216Z';
  const reopened = openPresentationArtifact(insert({ d: ring, width: 256, height: 256 }).bytes());
  const shape = reopened.document.slides[0]!.objects.at(-1)!;
  expect(shape.kind).toBe('shape');
  expect(shape.fill).toBe('rgba(191,78,54,1)');
  const [path] = shape.drawingGeometry!.paths;
  expect(path!.d).toContain('C');
  expect(path!.d).not.toContain('A');
  expect(
    new TextDecoder().decode(
      reopened.document.package.readPart(
        reopened.document.package.getPart('/ppt/slides/slide1.xml')!,
      ),
    ),
  ).toContain('<a:custGeom>');
});

test('unresolved references and malformed paths are rejected', () => {
  expect(() => insert('icon:coffee')).toThrow('Unresolved shape path reference');
  expect(() => insert({ d: 'M0,0 L10', width: 10, height: 10 })).toThrow('Invalid SVG path data');
});
