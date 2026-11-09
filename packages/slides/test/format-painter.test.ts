import { expect, test } from 'bun:test';
import { createPresentation, applyPresentationCommand, openPresentationArtifact, createPresentationNativeArchive, openPresentationNativeArchive, presentationFormatPainterSample, presentationFormatPainterCommands } from '../src/index.ts';
test('shape and text painter retains target text and geometry', () => {
  let a = createPresentation(); const slideId = a.document.slides[0]!.id;
  for (const text of ['Source', 'Target']) a = applyPresentationCommand(a, { name: 'insert-object', slideId, bounds: { x: 20, y: 20, width: 300, height: 100 }, object: { kind: 'shape', geometry: 'rect', text } });
  let [source, target] = a.document.slides[0]!.objects;
  a = applyPresentationCommand(a, { name: 'style-shape', slideId, objectKey: source!.key, fill: '#123456' });
  source = a.document.slides[0]!.objects[0]!;
  const commands = presentationFormatPainterCommands(presentationFormatPainterSample(source), slideId, target!);
  for (const command of commands) a = applyPresentationCommand(a, command);
  const painted = a.document.slides[0]!.objects[1]!;
  expect(painted.fill).toBe(source.fill);
  expect(painted.transform).toEqual(target!.transform);
  expect(painted.text!.paragraphs[0]!.runs[0]!.text).toBe('Target');
});
