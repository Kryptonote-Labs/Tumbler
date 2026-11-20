import { expect, test } from 'bun:test';
import { createMathEditor, emptyEquation, typeMathText } from '@tumblerjs/core/math';
import {
  applyPresentationCommand,
  createPresentation,
  importNativePresentation,
  openPresentationArtifact,
  slideTextValue,
  type PresentationArtifact,
} from '../src/index.ts';

const equation = typeMathText(createMathEditor(emptyEquation), 'x^2+1/n').equation;
const edited = typeMathText(createMathEditor(emptyEquation), 'a+b').equation;

function fixture() {
  let artifact = createPresentation();
  const slideId = artifact.document.slides[0]!.id;
  artifact = applyPresentationCommand(artifact, {
    name: 'insert-object',
    slideId,
    bounds: { x: 30, y: 40, width: 600, height: 200 },
    object: { kind: 'shape', text: 'Area  here' },
  });
  return { artifact, slideId, objectKey: artifact.document.slides[0]!.objects[0]!.key };
}
const object = (artifact: PresentationArtifact) => artifact.document.slides[0]!.objects[0]!;
const runs = (artifact: PresentationArtifact) => object(artifact).text!.paragraphs[0]!.runs;
const slideXml = (artifact: PresentationArtifact) =>
  new TextDecoder().decode(
    artifact.document.package.readPart(artifact.document.package.getPart(object(artifact).sourcePart)!),
  );

test('an inserted equation saves as PowerPoint Office Math and reopens editable', () => {
  const { artifact, slideId, objectKey } = fixture();
  const native = importNativePresentation(artifact);
  const command = { name: 'set-equation', slideId, objectKey, start: 5, end: 5, equation } as const;
  const after = applyPresentationCommand(native, command);
  expect(slideTextValue(object(after))).toBe('Area ￼ here');
  expect(runs(after).find((run) => run.equation)?.equation).toEqual(equation);

  const reopened = openPresentationArtifact(after.bytes());
  const xml = slideXml(reopened);
  expect(xml).toMatch(/<mc:AlternateContent[^>]*><mc:Choice Requires="a14"><p:sp[ >][^]*<a14:m [^>]*><m:oMath [^>]*><m:sSup>/);
  // Readers without a14 see the equation's linear format in the same shape.
  expect(xml).toMatch(/<mc:Fallback[^>]*><p:sp[ >][^]*<a:t>x\^2\+1\/n<\/a:t>[^]*<\/mc:Fallback>/);
  expect(xml).toContain('typeface="Cambria Math"');
  expect(slideTextValue(object(reopened))).toBe('Area ￼ here');
  expect(object(reopened).textEditable).toBe(true);
  expect(runs(reopened).find((run) => run.equation)?.equation).toEqual(equation);
});

test('editing, typing around and deleting an equation agree between native and saved models', () => {
  const { artifact, slideId, objectKey } = fixture();
  const commands = [
    { name: 'set-equation', slideId, objectKey, start: 5, end: 5, equation },
    { name: 'set-equation', slideId, objectKey, start: 5, end: 6, equation: edited },
    { name: 'edit-text', slideId, objectKey, start: 6, end: 6, value: '!' },
    { name: 'update-object', slideId, objectKey, x: 50, y: 60, width: 500, height: 150 },
  ] as const;
  let native: PresentationArtifact = importNativePresentation(artifact);
  for (const command of commands) native = applyPresentationCommand(native, command);
  const reopened = openPresentationArtifact(native.bytes());
  expect(slideTextValue(object(native))).toBe('Area ￼! here');
  expect(slideTextValue(object(reopened))).toBe(slideTextValue(object(native)));
  expect(runs(reopened).find((run) => run.equation)?.equation).toEqual(edited);
  // The fallback follows the shape's move.
  expect(slideXml(reopened).match(/<a:off x="476250" y="571500"\/>/g)).toHaveLength(2);

  const removed = applyPresentationCommand(native, { name: 'edit-text', slideId, objectKey, start: 5, end: 6, value: '' });
  const plain = slideXml(openPresentationArtifact(removed.bytes()));
  expect(plain).not.toContain('AlternateContent');
  expect(slideTextValue(object(openPresentationArtifact(removed.bytes())))).toBe('Area ! here');
});

test('typed text cannot forge an equation character', () => {
  const { artifact, slideId, objectKey } = fixture();
  expect(() =>
    applyPresentationCommand(artifact, { name: 'edit-text', slideId, objectKey, start: 0, end: 0, value: '￼' }),
  ).toThrow();
});
