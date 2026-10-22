import { expect, test } from 'bun:test';
import { openWordArtifact, wordImagePaintBounds, WordEditingSession } from '../src/index.ts';
import { wordPictureImageRect } from '../src/picture-geometry.ts';
import { pictureFixture } from './picture-fixture.ts';

for (const strict of [false, true]) test(`crop and transform survive editing and export, strict=${strict}`, () => {
  const bytes = pictureFixture({ strict, crop: 'l="50000" t="-25000"', transform: 'rot="5400000" flipH="true" flipV="1"' });
  const artifact = openWordArtifact(bytes);
  const drawing = [...artifact.document.drawings.values()][0]!;
  expect(drawing.kind).toBe('image');
  if (drawing.kind !== 'image') throw new Error('Expected image');
  expect(drawing.picture).toEqual({ left: .5, top: -.25, right: 0, bottom: 0, rotation: 90, flipH: true, flipV: true });
  expect(wordPictureImageRect(drawing.picture!)).toEqual({ x: -1, y: .2, width: 2, height: .8 });
  expect(artifact.bytes()).toEqual(bytes);
  const session = new WordEditingSession(artifact);
  const edited = session.updateDrawing({ elementId: drawing.elementId, widthPoints: 144, heightPoints: 36, layout: 'front', xPoints: 20, yPoints: 30 });
  const reopened = [...openWordArtifact(edited.bytes()).document.drawings.values()][0]!;
  expect(reopened).toMatchObject({ kind: 'image', widthPoints: 144, heightPoints: 36, picture: drawing.picture, bytes: drawing.bytes, anchor: { horizontalOffsetPoints: 20, verticalOffsetPoints: 30 } });
  expect(session.undo().bytes()).toEqual(bytes);
  expect(session.redo().bytes()).toEqual(edited.bytes());
});

test('percentage lexical form and signed rotation', () => {
  const drawing = [...openWordArtifact(pictureFixture({ strict: true, crop: 'l="50%"', transform: 'rot="-5400000" flipH="0"' })).document.drawings.values()][0]!;
  expect(drawing).toMatchObject({ kind: 'image', picture: { left: .5, rotation: -90, flipH: false } });
});

test.each([
  { crop: 'l="100000"' }, { crop: 'l="NaN"' }, { transform: 'rot="Infinity"' }, { transform: 'flipH="yes"' },
  { extraFill: '<a:tile/>' }, { extraFill: '<a:stretch><a:fillRect l="20000"/></a:stretch>' },
  { geometry: '<a:prstGeom prst="ellipse"/>' }, { extent: 'cx="457200" cy="914400"' },
])('unsupported geometry is explicit: %j', options => {
  const artifact = openWordArtifact(pictureFixture(options));
  expect([...artifact.document.drawings.values()][0]).toMatchObject({ kind: 'unsupported', reason: expect.any(String) });
  expect(openWordArtifact(artifact.bytes()).bytes()).toEqual(artifact.bytes());
});

function pictureBounds(options: Parameters<typeof pictureFixture>[0], width?: number, height?: number) {
  const drawing = [...openWordArtifact(pictureFixture(options)).document.drawings.values()][0]!;
  if (drawing.kind !== 'image') throw new Error('Expected image');
  return wordImagePaintBounds(drawing, width, height);
}

test('paint bounds include rotated pixels outside the unrotated frame at native and resized sizes', () => {
  for (const [width, height] of [[72, 36], [144, 108]]) {
    const bounds = pictureBounds({ crop: 'l="50000"', transform: 'rot="5400000" flipH="1"' }, width, height);
    expect(bounds.x).toBeCloseTo((width! - height!) / 2);
    expect(bounds.y).toBeCloseTo((height! - width!) / 2);
    expect(bounds.width).toBeCloseTo(height!);
    expect(bounds.height).toBeCloseTo(width!);
  }
});

test('paint bounds exclude transparent crop padding before reflection and rotation', () => {
  const bounds = pictureBounds({ crop: 'l="-100000"', transform: 'rot="5400000" flipH="1"' });
  expect(bounds.x).toBeCloseTo(18);
  expect(bounds.y).toBeCloseTo(-18);
  expect(bounds.width).toBeCloseTo(36);
  expect(bounds.height).toBeCloseTo(36);
  expect(pictureBounds({ crop: 'l="200000" r="-200000"', transform: 'rot="5400000"' })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
});

test('oblique paint bounds contain all transformed visible corners', () => {
  const bounds = pictureBounds({ crop: 't="-100000"', transform: 'rot="2700000" flipV="1"' });
  const extent = (72 + 18) / Math.sqrt(2);
  expect(bounds.width).toBeCloseTo(extent);
  expect(bounds.height).toBeCloseTo(extent);
  expect(bounds.x).toBeCloseTo(36 + 9 / Math.sqrt(2) - extent / 2);
  expect(bounds.y).toBeCloseTo(18 - 9 / Math.sqrt(2) - extent / 2);
});
