import { expect, test } from 'bun:test';
import { beginPackageTransaction } from '@tumblerjs/opc';
import {
  createPresentation,
  applyPresentationCommand as apply,
  importNativePresentation,
  openPresentationArtifact,
  encodePresentationNativeArchive,
  createPresentationNativeArchive,
  openPresentationNativeArchive,
  slideTextValue,
  type PresentationArtifact,
  type PresentationCommand,
} from '../src/index.ts';
import { newSlideLayout } from '../src/new-slide-layout.ts';

function shape(artifact: PresentationArtifact, text: string) {
  return apply(artifact, {
    name: 'insert-object',
    slideId: artifact.document.slides[0]!.id,
    bounds: { x: 0, y: 0, width: 200, height: 100 },
    object: { kind: 'shape', geometry: 'rect', text },
  });
}

test('native clipboard resolves source keys independently of destination keys during export', () => {
  const base = createPresentation(),
    slideId = base.document.slides[0]!.id;
  const source = shape(importNativePresentation(shape(base, 'Original source')), 'Copied source'),
    destination = shape(importNativePresentation(base), 'Destination');
  const pasted = apply(destination, {
    name: 'paste-object',
    slideId,
    sourceSlideId: slideId,
    objectKey: source.document.slides[0]!.objects.at(-1)!.key,
    source: Buffer.from(
      encodePresentationNativeArchive(createPresentationNativeArchive(source)),
    ).toString('base64'),
  });
  for (const artifact of [pasted, openPresentationArtifact(pasted.bytes())])
    expect(artifact.document.slides[0]!.objects.map(slideTextValue)).toEqual([
      'Destination',
      'Copied source',
    ]);
});

test('native checkpoints and export retain formatting boundaries in adjacent typing', () => {
  const source = shape(createPresentation(), 'Text'),
    slideId = source.document.slides[0]!.id,
    objectKey = source.document.slides[0]!.objects[0]!.key;
  let native = importNativePresentation(source);
  for (const [start, value, bold] of [
    [0, 'A', true],
    [1, 'B', false],
  ] as const)
    native = native.nativeCommand({
      name: 'edit-text',
      slideId,
      objectKey,
      start,
      end: start,
      value,
      formatting: { text: { bold: { set: bold } } },
    });
  const runs = (artifact: PresentationArtifact) =>
    artifact.document.slides[0]!.objects[0]!.text!.paragraphs[0]!.runs.flatMap((run) =>
      Array.from(run.text, (char) => [char, run.bold]),
    );
  const restored = openPresentationNativeArchive(createPresentationNativeArchive(native));
  expect(runs(openPresentationArtifact(restored.bytes()))).toEqual(runs(native));
});

test('inserted native slides instantiate the donor layout with matching export identities', () => {
  for (const layout of ['blank', 'title', 'two-content'] as const) {
    const base = createPresentation(),
      slideId = base.document.slides[0]!.id;
    let source = apply(base, { name: 'layout', slideId, layout });
    if (layout === 'two-content') {
      const part = newSlideLayout(source, slideId).part!,
        pkg = source.document.package;
      const xml = new TextDecoder()
        .decode(pkg.readPart(pkg.getPart(part)!))
        .replace(/<a:off x="[^"]+"/, '<a:off x="123456"');
      source = openPresentationArtifact(
        beginPackageTransaction(pkg).replacePart(part, new TextEncoder().encode(xml)).commit(),
      );
    }
    for (const explicit of [false, true]) {
      const native = importNativePresentation(source).nativeCommand({
        name: 'insert-slide',
        index: 1,
        ...(explicit ? { layoutSourceId: slideId } : {}),
      });
      const exported = openPresentationArtifact(native.bytes());
      const descriptors = (artifact: PresentationArtifact) =>
        artifact.document.slides[1]!.objects.map((object) => [
          object.layer,
          object.placeholder,
          object.transform,
          object.text?.anchor,
        ]);
      expect(descriptors(native)).toEqual(descriptors(exported));
      const target = native.document.slides[1]!.objects.filter((object) => object.textEditable).at(
        -1,
      );
      if (target) {
        const edited = native.nativeCommand({
          name: 'edit-text',
          slideId: native.document.slides[1]!.id,
          objectKey: target.key,
          start: 0,
          end: 0,
          value: 'New content',
        });
        expect(
          openPresentationArtifact(edited.bytes())
            .document.slides[1]!.objects.filter((object) => object.textEditable)
            .map(slideTextValue),
        ).toEqual(
          edited.document.slides[1]!.objects.filter((object) => object.textEditable).map(
            slideTextValue,
          ),
        );
      }
    }
  }
});

test('native table grid changes expand and shrink bounds after resizing', () => {
  const base = createPresentation(),
    slideId = base.document.slides[0]!.id;
  const source = apply(base, {
      name: 'insert-object',
      slideId,
      bounds: { x: 0, y: 0, width: 200, height: 100 },
      object: { kind: 'table', rows: 2, columns: 2 },
    }),
    objectKey = source.document.slides[0]!.objects[0]!.key;
  let native = importNativePresentation(source).nativeCommand({
    name: 'update-object',
    slideId,
    objectKey,
    x: 0,
    y: 0,
    width: 400,
    height: 200,
  });
  for (const action of ['insert-row', 'insert-column', 'delete-row', 'delete-column'] as const) {
    native = native.nativeCommand({
      name: 'edit-table',
      slideId,
      objectKey,
      action,
      row: 1,
      column: 1,
    });
    const exported = openPresentationArtifact(native.bytes()).document.slides[0]!.objects[0]!;
    expect(native.document.slides[0]!.objects[0]!.transform).toEqual(exported.transform);
    expect(native.document.slides[0]!.objects[0]!.matrix).toEqual(exported.matrix);
  }
});

test('native fill replacement removes the previous pattern and uses outline point units', () => {
  const original = shape(createPresentation(), 'Text'),
    slideId = original.document.slides[0]!.id,
    objectKey = original.document.slides[0]!.objects[0]!.key,
    pkg = original.document.package,
    part = pkg.getPart(original.document.slides[0]!.part)!;
  const xml = new TextDecoder()
    .decode(pkg.readPart(part))
    .replace(
      /<a:solidFill>.*?<\/a:solidFill>/,
      '<a:pattFill prst="pct50"><a:fgClr><a:srgbClr val="000000"/></a:fgClr><a:bgClr><a:srgbClr val="FFFFFF"/></a:bgClr></a:pattFill>',
    );
  const source = openPresentationArtifact(
    beginPackageTransaction(pkg).replacePart(part.name, new TextEncoder().encode(xml)).commit(),
  );
  expect(source.document.slides[0]!.objects[0]!.pattern).toBeDefined();
  const native = importNativePresentation(source).nativeCommand({
      name: 'style-shape',
      slideId,
      objectKey,
      fill: '#ff0000',
      stroke: '#000000',
      strokeWidth: 2,
    }),
    object = native.document.slides[0]!.objects[0]!,
    exported = openPresentationArtifact(native.bytes()).document.slides[0]!.objects[0]!;
  expect(object.pattern).toBeUndefined();
  expect(object.pictureFill).toBeUndefined();
  expect(object.fill).toBe(exported.fill);
  expect(object.strokeWidth).toBe(exported.strokeWidth);
});

test('native authoring rejects values that lossless DrawingML writers cannot export', () => {
  const source = shape(createPresentation(), 'Text'),
    slideId = source.document.slides[0]!.id,
    objectKey = source.document.slides[0]!.objects[0]!.key,
    native = importNativePresentation(source);
  const commands: PresentationCommand[] = [
    {
      name: 'format-text',
      slideId,
      objectKey,
      start: 0,
      end: 4,
      patch: { block: { verticalAlignment: { set: 'bottom' } } },
    },
    {
      name: 'format-text',
      slideId,
      objectKey,
      start: 0,
      end: 4,
      patch: { text: { fontSize: { set: 12.001 } } },
    },
    { name: 'style-shape', slideId, objectKey, strokeWidth: 1585 },
  ];
  for (const command of commands) {
    expect(() => apply(source, command)).toThrow(RangeError);
    expect(() => native.nativeCommand(command)).toThrow(RangeError);
  }
  expect(native.bytes()).toEqual(source.bytes());
});

test('native title insertion follows the master after successive authored layout changes', () => {
  for (const importedLayout of [undefined, 'blank', 'two-content'] as const) {
    let source = createPresentation();
    const slideId = source.document.slides[0]!.id;
    if (importedLayout) source = apply(source, { name: 'layout', slideId, layout: importedLayout });
    let native = importNativePresentation(source);
    for (const layout of ['blank', 'title', 'two-content', 'title'] as const) {
      native = native.nativeCommand({ name: 'layout', slideId, layout });
      native = openPresentationNativeArchive(createPresentationNativeArchive(native));
      const added = native.nativeCommand({ name: 'insert-slide', index: 1 });
      const exported = openPresentationArtifact(added.bytes());
      const descriptors = (artifact: PresentationArtifact) =>
        artifact.document.slides[1]!.objects.map((object) => [
          object.placeholder,
          object.transform,
          object.text?.anchor,
        ]);
      expect(descriptors(added)).toEqual(descriptors(exported));
    }
  }
});

test('authored native layouts retain theme fonts and explicit backgrounds through insertion', () => {
  const source = createPresentation(),
    slideId = source.document.slides[0]!.id;
  let native = importNativePresentation(source)
    .nativeCommand({ name: 'background', slideId, color: '#123456' })
    .nativeCommand({ name: 'layout', slideId, layout: 'title-content' })
    .nativeCommand({ name: 'insert-slide', index: 1 });
  const slide = native.document.slides[1]!,
    object = slide.objects.find((object) => object.textEditable)!;
  native = native.nativeCommand({
    name: 'edit-text',
    slideId: slide.id,
    objectKey: object.key,
    start: 0,
    end: 0,
    value: 'Heading',
  });
  const exported = openPresentationArtifact(native.bytes());
  expect(native.document.slides[0]!.background).toBe(exported.document.slides[0]!.background);
  expect(native.document.slides[1]!.background).toBe(exported.document.slides[1]!.background);
  const runs = (artifact: PresentationArtifact) =>
    artifact.document.slides[1]!.objects.filter((object) => object.textEditable).flatMap((object) =>
      object.text!.paragraphs.flatMap((paragraph) =>
        paragraph.runs.map((run) => [run.text, run.fontFamily, run.fontSize]),
      ),
    );
  expect(runs(native)).toEqual(runs(exported));
});

test('layout changes refresh inherited text styles while retaining explicit overrides equal to old defaults', () => {
  for (const explicit of [false, true]) {
    const base = createPresentation(),
      slideId = base.document.slides[0]!.id,
      source = apply(base, { name: 'layout', slideId, layout: 'title' });
    let native = importNativePresentation(source);
    const objectKey = native.document.slides[0]!.objects.find(
      (object) => object.placeholder === 'ctrTitle',
    )!.key;
    native = native.nativeCommand({
      name: 'edit-text',
      slideId,
      objectKey,
      start: 0,
      end: 0,
      value: 'Heading',
    });
    if (explicit)
      native = native.nativeCommand({
        name: 'format-text',
        slideId,
        objectKey,
        start: 0,
        end: 7,
        patch: {
          text: { fontSize: { set: 60 } },
          block: { horizontalAlignment: { set: 'center' } },
        },
      });
    native = openPresentationNativeArchive(createPresentationNativeArchive(native)).nativeCommand({
      name: 'layout',
      slideId,
      layout: 'title-content',
    });
    const styles = (artifact: PresentationArtifact) =>
      artifact.document.slides[0]!.objects.filter((object) => object.textEditable).flatMap(
        (object) =>
          object.text!.paragraphs.map((paragraph) => ({
            align: paragraph.align,
            bullet: paragraph.bullet,
            runs: (paragraph.runs.length
              ? paragraph.runs
              : paragraph.endRun
                ? [paragraph.endRun]
                : []
            ).map((run) => [run.text, run.fontSize, run.fontFamily, run.bold]),
          })),
      );
    expect(styles(native)).toEqual(styles(openPresentationArtifact(native.bytes())));
    if (explicit) {
      native = native.nativeCommand({
        name: 'format-text',
        slideId,
        objectKey,
        start: 0,
        end: 7,
        patch: { text: { fontSize: { inherit: true } } },
      });
      expect(styles(native)).toEqual(styles(openPresentationArtifact(native.bytes())));
      native = native.nativeCommand({
        name: 'format-text',
        slideId,
        objectKey,
        start: 0,
        end: 7,
        patch: { block: { horizontalAlignment: { inherit: true } } },
      });
      expect(styles(native)).toEqual(styles(openPresentationArtifact(native.bytes())));
    }
  }
});

test('layout inheritance retains an explicitly authored language for script font selection', () => {
  const base = createPresentation(),
    slideId = base.document.slides[0]!.id,
    title = apply(base, { name: 'layout', slideId, layout: 'title' }),
    pkg = title.document.package,
    part = title.document.slides[0]!.part;
  const xml = new TextDecoder()
    .decode(pkg.readPart(pkg.getPart(part)!))
    .replaceAll('lang="en-US"', 'lang="ja-JP"');
  const source = openPresentationArtifact(
    beginPackageTransaction(pkg).replacePart(part, new TextEncoder().encode(xml)).commit(),
  );
  let native = importNativePresentation(source);
  const objectKey = native.document.slides[0]!.objects.find(
    (object) => object.placeholder === 'ctrTitle',
  )!.key;
  native = native
    .nativeCommand({ name: 'edit-text', slideId, objectKey, start: 0, end: 0, value: '日本語' })
    .nativeCommand({ name: 'layout', slideId, layout: 'title-content' });
  const runs = native.document.slides[0]!.objects.find((object) => object.key === objectKey)!.text!
    .paragraphs[0]!.runs;
  expect(runs[0]!.nativeFonts?.language).toBe('ja-JP');
  const exported = openPresentationArtifact(native.bytes()).document.slides[0]!.objects.find(
    (object) => slideTextValue(object) === '日本語',
  )!.text!.paragraphs[0]!.runs;
  expect(runs.map((run) => run.fontFamily)).toEqual(exported.map((run) => run.fontFamily));
});

test('native layout metrics retain percentage spacing and the text body autofit reduction', () => {
  for (const fitting of [false, true]) {
    const base = createPresentation(),
      slideId = base.document.slides[0]!.id,
      title = apply(base, { name: 'layout', slideId, layout: 'title' }),
      pkg = title.document.package,
      part = title.document.slides[0]!.part;
    let xml = new TextDecoder()
      .decode(pkg.readPart(pkg.getPart(part)!))
      .replaceAll(
        '<a:p>',
        '<a:p><a:pPr><a:spcBef><a:spcPct val="50000"/></a:spcBef><a:spcAft><a:spcPct val="25000"/></a:spcAft></a:pPr>',
      );
    if (fitting)
      xml = xml.replaceAll(
        '<a:normAutofit/>',
        '<a:normAutofit fontScale="80000" lnSpcReduction="20000"/>',
      );
    const source = openPresentationArtifact(
      beginPackageTransaction(pkg).replacePart(part, new TextEncoder().encode(xml)).commit(),
    );
    let native = importNativePresentation(source);
    const objectKey = native.document.slides[0]!.objects.find(
      (object) => object.placeholder === 'ctrTitle',
    )!.key;
    native = native
      .nativeCommand({ name: 'edit-text', slideId, objectKey, start: 0, end: 0, value: 'Heading' })
      .nativeCommand({ name: 'layout', slideId, layout: 'title-content' });
    const metrics = (artifact: PresentationArtifact) =>
      artifact.document.slides[0]!.objects.filter((object) => object.textEditable).flatMap(
        (object) =>
          object.text!.paragraphs.map((paragraph) => [
            paragraph.before,
            paragraph.after,
            paragraph.lineHeight,
          ]),
      );
    expect(metrics(native)).toEqual(metrics(openPresentationArtifact(native.bytes())));
    native = native.nativeCommand({
      name: 'paragraph',
      slideId,
      objectKey,
      start: 0,
      end: 7,
      before: 6,
      after: 8,
      lineSpacing: 1.5,
    });
    expect(metrics(native)).toEqual(metrics(openPresentationArtifact(native.bytes())));
  }
});
