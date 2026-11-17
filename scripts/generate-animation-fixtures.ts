import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  createPresentation,
  applyPresentationCommand,
  entranceAnimationKinds,
  ENTRANCE_ANIMATIONS,
  normalizeEntranceAnimation,
} from '../packages/slides/src/index.ts';
const directory = resolve(process.argv[2] ?? '/tmp/tumbler-animation-fixtures');
await mkdir(directory, { recursive: true });
for (const kind of entranceAnimationKinds) {
  const directions: readonly string[] = ENTRANCE_ANIMATIONS[kind].directions;
  for (const direction of directions.length ? directions : ['']) {
    let artifact = createPresentation();
    const slideId = artifact.document.slides[0]!.id;
    artifact = applyPresentationCommand(artifact, {
      name: 'insert-object',
      slideId,
      bounds: { x: 300, y: 220, width: 300, height: 180 },
      object: {
        kind: 'shape',
        geometry: 'roundRect',
        text: `${ENTRANCE_ANIMATIONS[kind].label}\n${direction}`,
        fill: '#4472C4',
      },
    });
    artifact = applyPresentationCommand(artifact, {
      name: 'add-animation',
      slideId,
      objectKey: artifact.document.slides[0]!.objects[0]!.key,
      animation: normalizeEntranceAnimation({ kind, direction, duration: 800, delay: 100 }),
    });
    await Bun.write(
      join(directory, `${kind}${direction ? '-' + direction : ''}.pptx`),
      artifact.bytes(),
    );
  }
}
console.log(directory);
// Mixed starts and rotation exercise the executable timing wrappers, not only preset metadata.
let mixed = createPresentation();
const slideId = mixed.document.slides[0]!.id;
for (const [index, kind, start] of [
  [0, 'fade', 'click'],
  [1, 'fly', 'after'],
  [2, 'zoom', 'with'],
] as const) {
  mixed = applyPresentationCommand(mixed, {
    name: 'insert-object',
    slideId,
    bounds: { x: 160 + index * 340, y: 220, width: 240, height: 140 },
    object: { kind: 'shape', geometry: 'rect', text: `${kind} ${start}` },
  });
  const object = mixed.document.slides[0]!.objects.at(-1)!;
  if (index === 1)
    mixed = applyPresentationCommand(mixed, {
      name: 'update-object',
      slideId,
      objectKey: object.key,
      x: object.transform.x,
      y: object.transform.y,
      width: object.transform.width,
      height: object.transform.height,
      rotation: 30,
    });
  mixed = applyPresentationCommand(mixed, {
    name: 'add-animation',
    slideId,
    objectKey: object.key,
    animation: normalizeEntranceAnimation({ kind, start, delay: index * 100, duration: 800 }),
  });
}
await Bun.write(join(directory, 'sequence-mixed.pptx'), mixed.bytes());
// Exercise the empty main sequence and its reuse, as well as object-driven effect removal.
let removed = mixed;
for (const cue of mixed.document.slides[0]!.animations ?? [])
  removed = applyPresentationCommand(removed, {
    name: 'remove-animation',
    slideId,
    animationId: cue.id!,
  });
await Bun.write(join(directory, 'effects-removed.pptx'), removed.bytes());
const readded = applyPresentationCommand(removed, {
  name: 'add-animation',
  slideId,
  objectKey: removed.document.slides[0]!.objects[0]!.key,
  animation: normalizeEntranceAnimation({ kind: 'fade' }),
});
await Bun.write(join(directory, 'effect-readded.pptx'), readded.bytes());
let deleted = mixed;
for (const object of mixed.document.slides[0]!.objects)
  deleted = applyPresentationCommand(deleted, {
    name: 'delete-object',
    slideId,
    objectKey: object.key,
  });
await Bun.write(join(directory, 'animated-objects-deleted.pptx'), deleted.bytes());
