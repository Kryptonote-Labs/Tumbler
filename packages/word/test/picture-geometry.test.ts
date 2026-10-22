import { expect, test } from 'bun:test';
import { openWordArtifact, WordEditingSession } from '../src/index.ts';
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
