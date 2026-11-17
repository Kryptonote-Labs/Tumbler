import {
  createPresentation,
  applyPresentationCommand,
  createPresentationAnimationPlayer,
  entranceAnimationKinds,
} from '../packages/slides/src/index.ts';
import { authoredAnimation } from '../packages/slides/src/animation-authoring.ts';
// Headless CPU budget only: includes sampling/composition, excludes browser paint/layout and import.
// Decision: investigate if 250 simultaneous objects consume a 16.7ms frame budget here.
const count = 250,
  frames = 600;
let source = createPresentation();
source = applyPresentationCommand(source, {
  name: 'insert-object',
  slideId: source.document.slides[0]!.id,
  bounds: { x: 100, y: 100, width: 100, height: 70 },
  object: { kind: 'shape', geometry: 'rect' },
});
const object = source.document.slides[0]!.objects[0]!;
const objects = Array.from({ length: count }, (_, i) => ({
  ...object,
  key: String(i),
  shapeId: String(i),
}));
const animations = objects.map((object, i) => ({
  ...authoredAnimation(
    object.shapeId,
    {
      kind: entranceAnimationKinds[i % entranceAnimationKinds.length]!,
      start: 'with',
      duration: 1000,
    },
    String(i),
  ),
  step: 0,
}));
const runs: number[] = [];
let checksum = 0,
  outputs = 0;
for (let run = -1; run < 5; run++) {
  const player = createPresentationAnimationPlayer({ objects, animations }, 1280, 720);
  const start = performance.now();
  for (let frame = 0; frame < frames; frame++) {
    const sampled = player.sample(((frame % 60) * 1000) / 60);
    if (
      sampled.length !== count ||
      sampled.some((state) => !state.visible || !state.matrix.every(Number.isFinite))
    )
      throw new Error('Sampling did not execute every target correctly.');
    checksum += sampled.reduce(
      (sum, state) => sum + state.matrix[4] + state.matrix[5] + state.opacity,
      0,
    );
    if (run >= 0) outputs += sampled.length;
  }
  const elapsed = performance.now() - start;
  if (run >= 0) runs.push(elapsed / frames);
}
if (!Number.isFinite(checksum) || !checksum || outputs !== count * frames * 5)
  throw new Error('Incorrect benchmark work count.');
const sorted = [...runs].sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      scope: 'headless sampling and matrix composition; excludes DOM and paint',
      objects: count,
      framesPerRun: frames,
      runsMsPerFrame: runs,
      medianMsPerFrame: sorted[2],
      range: [sorted[0], sorted.at(-1)],
      errors: 0,
      outputs,
      checksum,
    },
    null,
    2,
  ),
);
