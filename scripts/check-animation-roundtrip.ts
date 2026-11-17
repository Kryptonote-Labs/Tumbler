import { resolve, join } from 'node:path';
import {
  openPresentationArtifact,
  animationInput,
  createPresentationAnimationPlayer,
} from '../packages/slides/src/index.ts';
const [sourceArg, returnedArg] = process.argv.slice(2);
if (!sourceArg || !returnedArg)
  throw new Error(
    'Usage: bun scripts/check-animation-roundtrip.ts SOURCE_DIRECTORY RETURNED_DIRECTORY',
  );
const source = resolve(sourceArg),
  returned = resolve(returnedArg);
let checked = 0;
for (const file of new Bun.Glob('*.pptx').scanSync(source)) {
  const original = openPresentationArtifact(await Bun.file(join(source, file)).bytes());
  const reopened = openPresentationArtifact(await Bun.file(join(returned, file)).bytes());
  const before = original.document.slides[0]!,
    after = reopened.document.slides[0]!;
  const inputs = (slide: typeof before) => slide.animations?.map(animationInput);
  if (JSON.stringify(inputs(before)) !== JSON.stringify(inputs(after)))
    throw new Error(`${file}: effect options/timing changed`);
  if (after.diagnostics.some((d) => d.message.includes('animation')))
    throw new Error(`${file}: returned animation has diagnostics`);
  const a = createPresentationAnimationPlayer(
    before,
    original.document.width,
    original.document.height,
  );
  const b = createPresentationAnimationPlayer(
    after,
    reopened.document.width,
    reopened.document.height,
  );
  a.advance(0);
  b.advance(0);
  for (const time of [0, 100, 300, 500, 900, 1500, 2000]) {
    const leftFrames = a.sample(time),
      rightFrames = b.sample(time);
    if (leftFrames.length !== rightFrames.length)
      throw new Error(`${file}: animated target count changed`);
    for (const [index, left] of leftFrames.entries()) {
      const right = rightFrames[index]!;
      // LibreOffice rounds DrawingML coordinates; compare visual properties in slide pixels.
      if (
        left.visible !== right.visible ||
        Math.abs(left.opacity - right.opacity) > 0.0001 ||
        left.clip !== right.clip ||
        left.matrix.some((value, index) => Math.abs(value - right.matrix[index]!) > 0.05)
      )
        throw new Error(`${file}: sampled target ${index} differs at ${time}ms`);
    }
  }
  checked++;
}
if (!checked) throw new Error('No entrance fixtures found.');
console.log(
  `PASS: ${checked} LibreOffice round-trips retain effect options, timing and sampled geometry.`,
);
