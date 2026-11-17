import { expect, test } from 'bun:test';
import { parseLosslessXml } from '@tumblerjs/ooxml';
import {
  createPresentation,
  applyPresentationCommand,
  openPresentationArtifact,
  importNativePresentation,
  createPresentationNativeArchive,
  openPresentationNativeArchive,
} from '../src/index.ts';
import type { PresentationArtifact } from '../src/index.ts';
import { readSlideTiming } from '../src/timing.ts';
import {
  ENTRANCE_ANIMATIONS,
  entranceAnimationKinds,
  normalizeEntranceAnimation,
  animationInput,
} from '../src/animation.ts';
import { createPresentationAnimationPlayer, animationProgress } from '../src/animation-program.ts';
import { animationNumber } from '../src/animation-expression.ts';
function deck() {
  let artifact = createPresentation();
  artifact = applyPresentationCommand(artifact, {
    name: 'insert-object',
    slideId: artifact.document.slides[0]!.id,
    bounds: { x: 200, y: 150, width: 180, height: 100 },
    object: { kind: 'shape', geometry: 'rect', text: 'Animate' },
  });
  return artifact;
}
function add(
  artifact: ReturnType<typeof deck>,
  kind: (typeof entranceAnimationKinds)[number],
  start: 'click' | 'with' | 'after' = 'click',
  delay = 0,
) {
  const slide = artifact.document.slides[0]!;
  return applyPresentationCommand(artifact, {
    name: 'add-animation',
    slideId: slide.id,
    objectKey: slide.objects.find((o) => o.layer === 'slide')!.key,
    animation: normalizeEntranceAnimation({ kind, start, duration: 500, delay }),
  });
}
test('all authored entrances survive PPTX readback with real behaviors and unique timing ids', () => {
  let artifact = deck();
  for (const kind of entranceAnimationKinds) artifact = add(artifact, kind);
  const slide = openPresentationArtifact(artifact.bytes()).document.slides[0]!;
  expect(slide.animations?.map((cue) => cue.kind)).toEqual(entranceAnimationKinds);
  expect(slide.animations?.map((cue) => cue.step)).toEqual(
    entranceAnimationKinds.map((_, i) => i + 1),
  );
  expect(slide.animations?.every((cue) => cue.tracks?.length && cue.editable)).toBe(true);
  const part = artifact.document.package.getPart(slide.part)!;
  const xml = parseLosslessXml(artifact.document.package.readPart(part));
  const ids = xml
    .elements(xml.root.namespaceUri, 'cTn')
    .map((node) => node.attributes.find((a) => a.localName === 'id')?.value);
  expect(new Set(ids).size).toBe(ids.length);
});
test('imported container repeats are diagnosed and cannot be rewritten as ordinary entrances', () => {
  for (const attributes of ['repeatCount="3000"', 'repeatDur="1500"', 'autoRev="true"']) {
    const source = parseLosslessXml(
      new TextEncoder().encode(
        `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:timing><p:tnLst><p:seq><p:cTn id="1" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="2" nodeType="clickEffect" presetClass="entr" presetID="10" ${attributes}><p:childTnLst><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="3" dur="500"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:seq></p:tnLst></p:timing></p:sld>`,
      ),
    );
    const timing = readSlideTiming(source.root);
    expect(timing.animations).toHaveLength(1);
    expect(timing.animations[0]?.editable).toBe(false);
    expect(timing.editingRestriction).toContain('repeated animation containers');
    expect(timing.warnings).toContain(
      'Repeated animation containers are preserved but cannot be played yet.',
    );
  }
});
test('removing the last effect keeps the object and permits a new entrance after export', () => {
  const animated = add(deck(), 'fade'),
    original = animated.document.slides[0]!;
  const removed = applyPresentationCommand(animated, {
    name: 'remove-animation',
    slideId: original.id,
    animationId: original.animations![0]!.id!,
  });
  const reopened = openPresentationArtifact(removed.bytes()),
    slide = reopened.document.slides[0]!;
  expect(slide.animations).toHaveLength(0);
  expect(slide.objects.map((object) => object.key)).toEqual(
    original.objects.map((object) => object.key),
  );
  const source = parseLosslessXml(
    reopened.document.package.readPart(reopened.document.package.getPart(slide.part)!),
  );
  for (const list of source.elements(source.root.namespaceUri, 'childTnLst'))
    expect(list.children.some((node) => node.kind === 'element')).toBe(true);
  const reanimated = openPresentationArtifact(add(reopened, 'zoom').bytes());
  expect(reanimated.document.slides[0]!.animations?.map((cue) => cue.kind)).toEqual(['zoom']);
});
test('with previous starts with previous cue and after previous waits for it including delays', () => {
  let artifact = add(deck(), 'fade', 'click', 100);
  artifact = add(artifact, 'fly', 'after', 200);
  artifact = add(artifact, 'zoom', 'with', 50);
  expect(
    artifact.document.slides[0]!.animations?.map((cue) => [
      cue.start,
      cue.step,
      cue.delay,
      cue.duration,
    ]),
  ).toEqual([
    ['click', 1, 100, 500],
    ['after', 1, 800, 500],
    ['with', 1, 850, 500],
  ]);
});
test('unsupported behavior still delays the following after-previous effect', () => {
  const effect = (id: number, type: string, behavior: string, dur: number) =>
    `<p:par><p:cTn id="${id}" nodeType="${type}"><p:childTnLst><p:${behavior} transition="in" filter="fade"><p:cBhvr><p:cTn id="${id + 10}" dur="${dur}"/><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cBhvr></p:${behavior}></p:childTnLst></p:cTn></p:par>`;
  const source = parseLosslessXml(
    new TextEncoder().encode(
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:timing><p:tnLst>${effect(1, 'clickEffect', 'animClr', 2000)}${effect(2, 'afterEffect', 'animEffect', 500)}</p:tnLst></p:timing></p:sld>`,
    ),
  );
  const result = readSlideTiming(source.root);
  expect(result.animations.map((cue) => [cue.delay, cue.duration])).toEqual([
    [0, 2000],
    [2000, 500],
  ]);
  expect(result.warnings.length).toBeGreaterThan(0);
});
test('headless fly samples off-slide, midpoint and final geometry without changing the scene', () => {
  const artifact = add(deck(), 'fly'),
    slide = artifact.document.slides[0]!;
  const before = JSON.stringify(slide.objects),
    player = createPresentationAnimationPlayer(
      slide,
      artifact.document.width,
      artifact.document.height,
    );
  expect(player.sample(0)[0]?.visible).toBe(false);
  expect(player.advance(100)).toBe(true);
  const start = player.sample(100)[0]!,
    mid = player.sample(350)[0]!,
    end = player.sample(600)[0]!;
  expect(start.matrix[5]).toBeCloseTo(720);
  expect(mid.matrix[5]).toBeCloseTo((720 + 150) / 2);
  expect(end.matrix[5]).toBeCloseTo(150);
  expect(end.visible).toBe(true);
  expect(JSON.stringify(slide.objects)).toBe(before);
});
test('native add, update, move, remove and archive export reconcile animation and shape identities', () => {
  let artifact: PresentationArtifact = importNativePresentation(deck());
  const slideId = artifact.document.slides[0]!.id;
  artifact = applyPresentationCommand(artifact, {
    name: 'insert-object',
    slideId,
    bounds: { x: 50, y: 50, width: 100, height: 80 },
    object: { kind: 'shape', geometry: 'ellipse' },
  });
  const objectKey = artifact.document.slides[0]!.objects.at(-1)!.key;
  artifact = applyPresentationCommand(artifact, {
    name: 'add-animation',
    slideId,
    objectKey,
    animation: normalizeEntranceAnimation({ kind: 'fade' }),
  });
  const first = artifact.document.slides[0]!.animations![0]!.id!;
  artifact = applyPresentationCommand(artifact, {
    name: 'add-animation',
    slideId,
    objectKey,
    animation: normalizeEntranceAnimation({ kind: 'fly', start: 'after', delay: 100 }),
  });
  const second = artifact.document.slides[0]!.animations![1]!.id!;
  artifact = applyPresentationCommand(artifact, {
    name: 'update-animation',
    slideId,
    animationId: first,
    animation: normalizeEntranceAnimation({ kind: 'zoom', duration: 700 }),
  });
  artifact = applyPresentationCommand(artifact, {
    name: 'move-animation',
    slideId,
    animationId: second,
    index: 0,
  });
  const restored = openPresentationNativeArchive(createPresentationNativeArchive(artifact));
  const exported = openPresentationArtifact(restored.bytes());
  expect(exported.document.slides[0]!.animations?.map((cue) => animationInput(cue))).toEqual(
    restored.document.slides[0]!.animations?.map((cue) => animationInput(cue)),
  );
  const removed = applyPresentationCommand(restored, {
    name: 'remove-animation',
    slideId,
    animationId: first,
  });
  expect(openPresentationArtifact(removed.bytes()).document.slides[0]!.animations).toHaveLength(1);
});
test('arithmetic values are checked without executing JavaScript', () => {
  const variables = { ppt_x: 0.3, ppt_y: 0.2, ppt_w: 0.1, ppt_h: 0.1, time: 0.5 };
  expect(animationNumber('#ppt_x+0.2', variables)).toBe(0.5);
  expect(animationNumber('sin(pi*$)', variables)).toBeCloseTo(1);
  expect(animationNumber('globalThis.process.exit()', variables)).toBeUndefined();
  expect(animationNumber('1/0', variables)).toBeUndefined();
  expect(animationProgress(0.25, 0.5, 0)).toBeCloseTo(1 / 12);
});

test('deleting an animated object removes its entrance from native state and PPTX', () => {
  const artifact = add(importNativePresentation(deck()), 'fly'),
    slide = artifact.document.slides[0]!;
  const removed = applyPresentationCommand(artifact, {
    name: 'delete-object',
    slideId: slide.id,
    objectKey: slide.objects[0]!.key,
  });
  expect(removed.document.slides[0]!.animations).toHaveLength(0);
  expect(openPresentationArtifact(removed.bytes()).document.slides[0]!.animations).toHaveLength(0);
});
test('concurrent animation additions keep queued edits attached to the local effect', async () => {
  const { rebasePresentationCommands } = await import('../src/collaboration.ts');
  const base = importNativePresentation(deck()),
    slide = base.document.slides[0]!;
  const local = {
    name: 'add-animation',
    slideId: slide.id,
    objectKey: slide.objects[0]!.key,
    animation: normalizeEntranceAnimation({ kind: 'fly' }),
  } as const;
  const remoteCommand = { ...local, animation: normalizeEntranceAnimation({ kind: 'fade' }) };
  const localState = applyPresentationCommand(base, local),
    remote = applyPresentationCommand(base, remoteCommand);
  const result = rebasePresentationCommands(
    base,
    remote,
    [
      local,
      {
        name: 'update-animation',
        slideId: slide.id,
        animationId: localState.document.slides[0]!.animations![0]!.id!,
        animation: normalizeEntranceAnimation({ kind: 'zoom' }),
      },
    ],
    [remoteCommand],
  );
  expect(result.artifact.document.slides[0]!.animations?.map((cue) => cue.kind)).toEqual([
    'fade',
    'zoom',
  ]);
  expect(
    openPresentationArtifact(result.artifact.bytes()).document.slides[0]!.animations?.map(
      (cue) => cue.kind,
    ),
  ).toEqual(['fade', 'zoom']);
});
test('old compiled slide models restore animation behaviors from their preserved PPTX once', async () => {
  const { restoreNativePresentation } = await import('../src/native-document.ts');
  const source = add(deck(), 'fly'),
    native = importNativePresentation(source),
    snapshot = native.snapshot();
  const legacy = restoreNativePresentation(
    {
      ...snapshot,
      slides: snapshot.slides.map((item) => {
        const { animationVersion, animations, ...slide } = item.slide;
        return { ...item, slide: { ...slide, animations: [] } };
      }),
    },
    () => source,
  );
  const restored = openPresentationNativeArchive(createPresentationNativeArchive(legacy));
  expect(restored.document.slides[0]!.animationVersion).toBe(1);
  expect(restored.document.slides[0]!.animations?.[0]?.kind).toBe('fly');
  expect(restored.requiresCompiledViewCheckpoint).toBe(true);
});
test('all entrance directions reach the unchanged final shape geometry and remain hidden before their click', () => {
  for (const kind of entranceAnimationKinds)
    for (const direction of ENTRANCE_ANIMATIONS[kind].directions.length
      ? ENTRANCE_ANIMATIONS[kind].directions
      : ['']) {
      const initial = deck(),
        target = initial.document.slides[0]!;
      const artifact = applyPresentationCommand(initial, {
          name: 'add-animation',
          slideId: target.id,
          objectKey: target.objects[0]!.key,
          animation: normalizeEntranceAnimation({ kind, direction }),
        }),
        slide = artifact.document.slides[0]!,
        player = createPresentationAnimationPlayer(slide, 1280, 720);
      expect(player.sample(0)[0]?.visible).toBe(false);
      player.advance(0);
      const frame = player.sample(1000)[0]!;
      expect(
        frame.matrix.every(
          (value, index) => Math.abs(value - slide.objects[0]!.matrix[index]!) < 1e-8,
        ),
      ).toBe(true);
      expect(frame.visible).toBe(true);
      expect(frame.opacity).toBe(1);
      expect(player.running).toBe(false);
    }
});

test('fly-in keeps rotated corners off-slide and zoom preserves its rotation and centre', () => {
  let artifact = deck();
  const slide = artifact.document.slides[0]!;
  artifact = applyPresentationCommand(artifact, {
    name: 'update-object',
    slideId: slide.id,
    objectKey: slide.objects[0]!.key,
    x: 200,
    y: 150,
    width: 180,
    height: 100,
    rotation: 45,
  });
  for (const kind of ['fly', 'zoom'] as const) {
    const animated = add(artifact, kind),
      frameSlide = animated.document.slides[0]!;
    const player = createPresentationAnimationPlayer(frameSlide, 1280, 720);
    player.advance(0);
    const frame = player.sample(0)[0]!,
      object = frameSlide.objects[0]!,
      [a, b, c, d, e, f] = frame.matrix;
    if (kind === 'fly') {
      const ys = [
        f,
        b * object.transform.width + f,
        d * object.transform.height + f,
        b * object.transform.width + d * object.transform.height + f,
      ];
      expect(Math.min(...ys)).toBeCloseTo(720);
    } else {
      const original = object.matrix;
      expect(e).toBeCloseTo(
        (original[0] * object.transform.width) / 2 +
          (original[2] * object.transform.height) / 2 +
          original[4],
      );
      expect(f).toBeCloseTo(
        (original[1] * object.transform.width) / 2 +
          (original[3] * object.transform.height) / 2 +
          original[5],
      );
    }
    expect(
      player
        .sample(1000)[0]!
        .matrix.every((value, index) => Math.abs(value - object.matrix[index]!) < 1e-8),
    ).toBe(true);
  }
});

test('agent inspection exposes stable effect addresses and the same authoring options as the UI', async () => {
  const { inspectPresentation } = await import('../src/inspect.ts');
  const artifact = add(importNativePresentation(deck()), 'fly', 'after', 100);
  const inspection = inspectPresentation(artifact),
    effect = inspection.slide.animations[0]!;
  expect(effect.animationId).toBe(artifact.document.slides[0]!.animations![0]!.id);
  expect(effect.objectKey).toBe(inspection.slide.objects[0]!.key);
  expect(effect).toMatchObject({ kind: 'fly', start: 'after', delay: 100, editable: true });
});
