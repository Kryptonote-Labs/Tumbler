import { expect, test } from 'bun:test';
import { beginPackageTransaction } from '@tumblerjs/opc';
import {
  createPresentation,
  applyPresentationCommand,
  openPresentationArtifact,
  importNativePresentation,
  createPresentationNativeArchive,
  createPresentationNativeView,
  openPresentationNativeArchive,
  encodePresentationNativeArchive,
  decodePresentationNativeArchive,
  slideTextValue,
  NativePresentationDocument,
  encodePresentationNativeState,
  presentationSlideResources,
  presentationNativeContent,
} from '../src/index.ts';
import type { PresentationArtifact, PresentationCommand } from '../src/index.ts';

function fixture() {
  let artifact = createPresentation();
  const slideId = artifact.document.slides[0]!.id;
  artifact = applyPresentationCommand(artifact, {
    name: 'insert-object',
    slideId,
    bounds: { x: 30, y: 40, width: 600, height: 200 },
    object: { kind: 'shape', text: 'First paragraph\nSecond paragraph' },
  });
  const tx = beginPackageTransaction(artifact.document.package);
  tx.addPart('/opaque/preserve.bin', 'application/octet-stream', new Uint8Array([0, 17, 255, 2]));
  artifact = openPresentationArtifact(tx.commit());
  return { artifact, slideId, objectKey: artifact.document.slides[0]!.objects[0]!.key };
}
function text(artifact: PresentationArtifact) {
  return artifact.document.slides.flatMap((s) => s.objects.map(slideTextValue));
}

test('native conversion retains exact ZIP bytes, opaque parts and editing after complete restoration', () => {
  const { artifact, slideId, objectKey } = fixture(),
    archive = createPresentationNativeArchive(artifact);
  const restored = openPresentationNativeArchive(
    decodePresentationNativeArchive(encodePresentationNativeArchive(archive)),
  );
  expect(restored.bytes()).toEqual(artifact.bytes());
  expect(presentationNativeContent(restored)).toBe(presentationNativeContent(artifact));
  const command = {
    name: 'edit-text',
    slideId,
    objectKey,
    start: 5,
    end: 15,
    value: ' native\ntext',
  } as const;
  const native = applyPresentationCommand(restored, command),
    original = applyPresentationCommand(artifact, command);
  expect(text(native)).toEqual(text(original));
  expect(native.bytes()).toEqual(original.bytes());
  const output = openPresentationArtifact(native.bytes());
  expect(
    output.document.package.readPart(output.document.package.getPart('/opaque/preserve.bin')!),
  ).toEqual(new Uint8Array([0, 17, 255, 2]));
});

test('partial native opening edits without preservation data and rejects incomplete export', () => {
  const { artifact, slideId, objectKey } = fixture(),
    archive = createPresentationNativeArchive(artifact);
  const restored = openPresentationNativeArchive({
    version: 1,
    manifest: archive.manifest,
    slides: new Map([[slideId, archive.slides.get(slideId)!]]),
  });
  const edited = applyPresentationCommand(restored, {
    name: 'edit-text',
    slideId,
    objectKey,
    start: 0,
    end: 0,
    value: 'Native ',
  });
  expect(text(edited)[0]).toStartWith('Native First');
  expect(() => edited.bytes()).toThrow('preservation');
});

test('native commands are atomic, preserve unrelated object identities and do not consult XML', () => {
  const { artifact, slideId, objectKey } = fixture();
  const source = importNativePresentation(artifact);
  const archive = createPresentationNativeArchive(source);
  const native = openPresentationNativeArchive({
    version: 1,
    manifest: archive.manifest,
    slides: archive.slides,
  });
  const before = native.document.slides[0];
  expect(() =>
    applyPresentationCommand(native, {
      name: 'batch',
      commands: [
        { name: 'edit-text', slideId, objectKey, start: 0, end: 0, value: 'lost ' },
        { name: 'edit-text', slideId, objectKey, start: 0, end: 100000, value: 'bad' },
      ],
    }),
  ).toThrow();
  expect(native.document.slides[0]).toBe(before);
  expect(text(native)).toEqual(text(source));
  let edited = applyPresentationCommand(native, {
    name: 'insert-object',
    slideId,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    object: { kind: 'shape' },
  });
  const untouched = edited.document.slides[0]!.objects[1];
  edited = applyPresentationCommand(edited, {
    name: 'edit-text',
    slideId,
    objectKey,
    start: 0,
    end: 0,
    value: 'safe ',
  });
  expect(edited.document.slides[0]!.objects[1]).toBe(untouched);
});

test('new native identities export and remain addressable after copy, duplication and restoration', () => {
  const { artifact, slideId } = fixture();
  let native: PresentationArtifact = importNativePresentation(artifact);
  native = applyPresentationCommand(native, {
    name: 'insert-object',
    slideId,
    bounds: { x: 100, y: 100, width: 300, height: 200 },
    object: { kind: 'table', rows: 2, columns: 2 },
  });
  const key = native.document.slides[0]!.objects.at(-1)!.key;
  native = applyPresentationCommand(native, {
    name: 'edit-text',
    slideId,
    objectKey: key,
    cell: { row: 1, column: 1 },
    start: 0,
    end: 0,
    value: 'Cell',
  });
  native = applyPresentationCommand(native, {
    name: 'edit-table',
    slideId,
    objectKey: key,
    action: 'insert-row',
    row: 1,
    column: 0,
  });
  native = applyPresentationCommand(native, { name: 'duplicate-object', slideId, objectKey: key });
  native = applyPresentationCommand(native, { name: 'insert-slide', index: 1, sourceId: slideId });
  const archive = createPresentationNativeArchive(native),
    restored = openPresentationNativeArchive(archive);
  expect(text(restored)).toEqual(text(native));
  expect(restored.bytes()).toEqual(native.bytes());
  expect(openPresentationArtifact(native.bytes()).document.slides).toHaveLength(2);
});

test('native text formatting, clearing and multiline edits agree with OOXML authoring', () => {
  const { artifact, slideId, objectKey } = fixture();
  let native: PresentationArtifact = importNativePresentation(artifact),
    original = artifact;
  const commands: PresentationCommand[] = [
    {
      name: 'format-text',
      slideId,
      objectKey,
      start: 0,
      end: 5,
      patch: { text: { bold: { set: true }, fontSize: { set: 32 } } },
    },
    { name: 'edit-text', slideId, objectKey, start: 3, end: 18, value: 'new\nparagraph\n' },
    {
      name: 'format-text',
      slideId,
      objectKey,
      start: 0,
      end: 3,
      patch: { text: { bold: { inherit: true }, fontSize: { inherit: true } } },
    },
    { name: 'paragraph', slideId, objectKey, start: 0, end: 2, bullet: 'bullet' },
  ];
  for (const command of commands) {
    native = applyPresentationCommand(native, command);
    original = applyPresentationCommand(original, command);
    expect(text(native)).toEqual(text(original));
    expect(native.bytes()).toEqual(original.bytes());
  }
  const run = native.document.slides[0]!.objects[0]!.text!.paragraphs[0]!.runs[0]!;
  const source = original.document.slides[0]!.objects[0]!.text!.paragraphs[0]!.runs[0]!;
  expect(run.bold).toEqual(source.bold);
  expect(run.fontSize).toEqual(source.fontSize);
});

test('native archive rejects damaged blocks', () => {
  const { artifact } = fixture(),
    archive = createPresentationNativeArchive(artifact);
  const id = artifact.document.slides[0]!.id;
  const bytes = archive.slides.get(id)!.slice();
  bytes[bytes.length - 2] = bytes[bytes.length - 2]! ^ 1;
  expect(() =>
    openPresentationNativeArchive({ ...archive, slides: new Map([[id, bytes]]) }),
  ).toThrow();
});

test('native Unicode typing, theme font selection and scaled font formatting match imported authoring', () => {
  const f = fixture(),
    pkg = f.artifact.document.package,
    part = pkg.getPart(f.artifact.document.slides[0]!.part)!;
  const xml = new TextDecoder()
    .decode(pkg.readPart(part))
    .replace('<a:bodyPr/>', '<a:bodyPr><a:normAutofit fontScale="75000"/></a:bodyPr>');
  let source = openPresentationArtifact(
    beginPackageTransaction(pkg).replacePart(part.name, new TextEncoder().encode(xml)).commit(),
  );
  let native: PresentationArtifact = importNativePresentation(source);
  const value = '漢字 العربية é 👩🏽‍💻';
  for (const command of [
    { name: 'edit-text', slideId: f.slideId, objectKey: f.objectKey, start: 0, end: 0, value },
    {
      name: 'format-text',
      slideId: f.slideId,
      objectKey: f.objectKey,
      start: 0,
      end: value.length,
      patch: { text: { fontSize: { set: 36 }, fontFamily: { set: 'Tahoma' } } },
    },
  ] satisfies PresentationCommand[]) {
    source = applyPresentationCommand(source, command);
    native = applyPresentationCommand(native, command);
    const simple = (a: PresentationArtifact) =>
      a.document.slides[0]!.objects[0]!.text!.paragraphs.map((p) =>
        p.runs.flatMap((r) =>
          Array.from(r.text, (text) => ({
            text,
            font: r.fontFamily,
            size: r.fontSize,
            color: r.color,
          })),
        ),
      );
    expect(simple(native)).toEqual(simple(source));
  }
  expect(() =>
    applyPresentationCommand(native, {
      name: 'edit-text',
      slideId: f.slideId,
      objectKey: f.objectKey,
      start: value.indexOf('👩') + 1,
      end: value.indexOf('👩') + 1,
      value: 'x',
    }),
  ).toThrow('grapheme');
});

test('recovery preserves unresolved media references while native text edits continue', () => {
  const f = fixture();
  const artifact = applyPresentationCommand(f.artifact, {
    name: 'insert-object',
    slideId: f.slideId,
    bounds: { x: 0, y: 0, width: 20, height: 20 },
    object: {
      kind: 'image',
      contentType: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c7z8AAAAASUVORK5CYII=',
    },
  });
  const archive = createPresentationNativeArchive(artifact);
  const partial = openPresentationNativeArchive({
    ...archive,
    resources: new Map(),
    allowPendingResources: true,
  });
  const edited = applyPresentationCommand(partial, {
    name: 'edit-text',
    slideId: f.slideId,
    objectKey: f.objectKey,
    start: 0,
    end: 0,
    value: 'Pending ',
  });
  const recovery = decodePresentationNativeArchive(encodePresentationNativeState(edited));
  expect(recovery.resources?.size).toBe(0);
  expect(presentationSlideResources(recovery.slides.get(f.slideId)!)).toEqual(
    presentationSlideResources(archive.slides.get(f.slideId)!),
  );
  const restored = openPresentationNativeArchive({ ...recovery, resources: archive.resources });
  expect(text(restored)[0]).toStartWith('Pending First');
  expect(restored.document.slides[0]!.objects.at(-1)!.image?.bytes).toEqual(
    artifact.document.slides[0]!.objects.at(-1)!.image?.bytes,
  );
});

test('text edits retain unsupported slide timing, transitions and extension markup', () => {
  const f = fixture(),
    pkg = f.artifact.document.package,
    part = pkg.getPart(f.artifact.document.slides[0]!.part)!;
  const opaque =
    '<p:transition advTm="1700"><p:fade/></p:transition><p:timing><p:tnLst><p:par><p:cTn id="41" dur="indefinite" nodeType="tmRoot"/></p:par></p:tnLst></p:timing><p:extLst><p:ext uri="kryptonote-test"><future:feature xmlns:future="urn:future" mode="opaque">keep me</future:feature></p:ext></p:extLst>';
  const source = openPresentationArtifact(
    beginPackageTransaction(pkg)
      .replacePart(
        part.name,
        new TextEncoder().encode(
          new TextDecoder().decode(pkg.readPart(part)).replace('</p:sld>', opaque + '</p:sld>'),
        ),
      )
      .commit(),
  );
  const native = openPresentationNativeArchive(createPresentationNativeArchive(source));
  const edited = applyPresentationCommand(native, {
    name: 'edit-text',
    slideId: f.slideId,
    objectKey: f.objectKey,
    start: 0,
    end: 0,
    value: 'Safe ',
  });
  const exported = openPresentationArtifact(edited.bytes());
  expect(
    new TextDecoder().decode(
      exported.document.package.readPart(exported.document.package.getPart(part.name)!),
    ),
  ).toContain(opaque);
  expect(exported.document.slides[0]!.transition).toEqual(source.document.slides[0]!.transition);
  expect(exported.document.slides[0]!.animations).toEqual(source.document.slides[0]!.animations);
});

test('native shape radius, resize, rotation and inherited background match exported authoring', () => {
  let source = createPresentation();
  const slideId = source.document.slides[0]!.id;
  source = applyPresentationCommand(source, {
    name: 'insert-object',
    slideId,
    object: { kind: 'shape', geometry: 'roundRect', cornerRadius: 20 },
    bounds: { x: 10, y: 10, width: 100, height: 80 },
  });
  source = applyPresentationCommand(source, { name: 'background', slideId, color: '#112233' });
  const objectKey = source.document.slides[0]!.objects[0]!.key;
  let native: PresentationArtifact = importNativePresentation(source);
  const commands: PresentationCommand[] = [
    { name: 'style-shape', slideId, objectKey, cornerRadius: 16 },
    {
      name: 'update-object',
      slideId,
      objectKey,
      x: 2,
      y: 3,
      width: 200,
      height: 120,
      rotation: 721.234567,
    },
    { name: 'set-background', slideId, fill: { kind: 'inherit' } },
  ];
  for (const command of commands) {
    native = applyPresentationCommand(native, command);
    const output = openPresentationArtifact(native.bytes());
    const actual = native.document.slides[0]!,
      expected = output.document.slides[0]!;
    expect(actual.background).toEqual(expected.background);
    expect(actual.objects[0]!.cornerRadius).toEqual(expected.objects[0]!.cornerRadius);
    expect(actual.objects[0]!.drawingGeometry).toEqual(expected.objects[0]!.drawingGeometry);
    expect(actual.objects[0]!.transform).toEqual(expected.objects[0]!.transform);
  }
});

test('long typing histories compact export work without changing formatting or opaque preservation', () => {
  const f = fixture();
  let source = f.artifact,
    native: PresentationArtifact = importNativePresentation(source);
  for (const value of 'A long sentence typed one character at a time.') {
    const command = {
      name: 'edit-text',
      slideId: f.slideId,
      objectKey: f.objectKey,
      start: 0,
      end: 0,
      value,
    } as const;
    source = applyPresentationCommand(source, command);
    native = applyPresentationCommand(native, command);
  }
  expect(native).toBeInstanceOf(NativePresentationDocument);
  expect((native as NativePresentationDocument).snapshot().changes).toHaveLength(1);
  expect(text(native)).toEqual(text(source));
  expect(native.bytes()).toEqual(source.bytes());
  const reopened = openPresentationNativeArchive(createPresentationNativeArchive(native));
  expect(reopened.state.revisionKey).toBe((native as NativePresentationDocument).state.revisionKey);
  expect(reopened.bytes()).toEqual(source.bytes());
});

test('attaching a complete native source retains provenance of newly created objects through another archive', () => {
  const f = fixture();
  const full = applyPresentationCommand(importNativePresentation(f.artifact), {
    name: 'insert-object',
    slideId: f.slideId,
    object: { kind: 'shape', text: 'Native identity' },
    bounds: { x: 1, y: 2, width: 100, height: 50 },
  }) as NativePresentationDocument;
  const view = createPresentationNativeView(full);
  const partial = openPresentationNativeArchive(view);
  const key = partial.document.slides[0]!.objects.at(-1)!.key;
  const branch = applyPresentationCommand(partial, {
    name: 'edit-text',
    slideId: f.slideId,
    objectKey: key,
    start: 0,
    end: 0,
    value: 'Local ',
  }) as NativePresentationDocument;
  const restored = openPresentationNativeArchive(
    createPresentationNativeArchive(branch.withSource(() => full)),
  );
  expect(restored.bytes()).toEqual(branch.withSource(() => full).bytes());
  expect(text(openPresentationArtifact(restored.bytes())).at(-1)).toBe('Local Native identity');
});

test('native table structure preserves cell layout and text through merged row and column edits', () => {
  const f = fixture();
  const source = applyPresentationCommand(f.artifact, {
    name: 'insert-object',
    slideId: f.slideId,
    object: { kind: 'table', rows: 3, columns: 3 },
    bounds: { x: 20, y: 30, width: 600, height: 300 },
  });
  const key = source.document.slides[0]!.objects.at(-1)!.key;
  let native: PresentationArtifact = importNativePresentation(source);
  const commands: PresentationCommand[] = [
    {
      name: 'edit-text',
      slideId: f.slideId,
      objectKey: key,
      cell: { row: 0, column: 0 },
      start: 0,
      end: 0,
      value: 'Cell A',
    },
    {
      name: 'edit-table',
      slideId: f.slideId,
      objectKey: key,
      action: 'merge',
      row: 0,
      column: 0,
      endRow: 1,
      endColumn: 1,
    },
    {
      name: 'edit-table',
      slideId: f.slideId,
      objectKey: key,
      action: 'insert-row',
      row: 1,
      column: 0,
    },
    {
      name: 'edit-table',
      slideId: f.slideId,
      objectKey: key,
      action: 'insert-column',
      row: 0,
      column: 1,
    },
    { name: 'edit-table', slideId: f.slideId, objectKey: key, action: 'split', row: 0, column: 0 },
    {
      name: 'edit-table',
      slideId: f.slideId,
      objectKey: key,
      action: 'delete-row',
      row: 1,
      column: 0,
    },
  ];
  const cells = (a: PresentationArtifact) =>
    a.document.slides[0]!.objects.at(-1)!.table!.cells.map((c) => ({
      row: c.row,
      column: c.column,
      rowSpan: c.rowSpan,
      columnSpan: c.columnSpan,
      x: c.x,
      y: c.y,
      width: c.width,
      height: c.height,
      text: c.text?.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n'),
    }));
  for (const command of commands) {
    native = applyPresentationCommand(native, command);
    expect(cells(native)).toEqual(cells(openPresentationArtifact(native.bytes())));
  }
});

test('native ink remains usable in a semantic first slide before compatibility media arrives', () => {
  const source = importNativePresentation(createPresentation());
  const slideId = source.document.slides[0]!.id;
  const edited = applyPresentationCommand(source, {
    name: 'insert-ink',
    slideId,
    color: '#123456',
    size: 4,
    points: [
      [10, 20, 0.5],
      [30, 40, 1],
      [50, 20, 0.2],
    ],
  });
  const archive = createPresentationNativeArchive(edited);
  const partial = openPresentationNativeArchive({
    version: 1,
    manifest: archive.manifest,
    slides: archive.slides,
    allowPendingResources: true,
  });
  const object = partial.document.slides[0]!.objects[0]!;
  expect(object.ink?.document.traces[0]!.points).toEqual(
    edited.document.slides[0]!.objects[0]!.ink?.document.traces[0]!.points,
  );
  expect(object.movable).toBe(true);
  const moved = applyPresentationCommand(partial, {
    name: 'update-object',
    slideId,
    objectKey: object.key,
    width: object.transform.width,
    height: object.transform.height,
    rotation: object.transform.rotation,
    x: 200,
    y: 150,
  });
  expect(moved.document.slides[0]!.objects[0]!.transform.x).toBe(200);
});

test('compacted shape changes retain earlier properties when later patches omit them', () => {
  const f = fixture();
  let native: PresentationArtifact = importNativePresentation(f.artifact);
  native = applyPresentationCommand(native, {
    name: 'style-shape',
    slideId: f.slideId,
    objectKey: f.objectKey,
    fill: '#123456',
  });
  native = applyPresentationCommand(native, {
    name: 'style-shape',
    slideId: f.slideId,
    objectKey: f.objectKey,
    stroke: '#654321',
    fill: undefined,
  });
  const output = openPresentationArtifact(native.bytes()).document.slides[0]!.objects[0]!;
  expect(output.fill).toBe(native.document.slides[0]!.objects[0]!.fill);
  expect(output.stroke).toBe(native.document.slides[0]!.objects[0]!.stroke);
});

test('arriving resources hydrate the current text revision without downloading an older slide model', () => {
  const f = fixture();
  const source = applyPresentationCommand(f.artifact, {
    name: 'insert-object',
    slideId: f.slideId,
    object: {
      kind: 'image',
      contentType: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c7z8AAAAASUVORK5CYII=',
    },
    bounds: { x: 0, y: 0, width: 100, height: 100 },
  });
  const archive = createPresentationNativeArchive(source);
  const partial = openPresentationNativeArchive({
    ...archive,
    resources: new Map(),
    allowPendingResources: true,
  });
  const branch = applyPresentationCommand(partial, {
    name: 'edit-text',
    slideId: f.slideId,
    objectKey: f.objectKey,
    start: 0,
    end: 0,
    value: 'Current ',
  }) as NativePresentationDocument;
  const hydrated = branch.hydrateResources(archive.resources!, new Set([f.slideId]));
  expect(hydrated.sameState(branch)).toBe(true);
  expect(hydrated.document.slides[0]!.objects[0]).toBe(branch.document.slides[0]!.objects[0]);
  expect(text(hydrated)[0]).toStartWith('Current First');
  expect(hydrated.document.slides[0]!.objects.at(-1)!.image?.bytes).toEqual(
    source.document.slides[0]!.objects.at(-1)!.image?.bytes,
  );
  const recovery = decodePresentationNativeArchive(
    encodePresentationNativeState(hydrated, { includeResources: false }),
  );
  expect(recovery.resources?.size).toBe(0);
  expect(presentationSlideResources(recovery.slides.get(f.slideId)!)).toEqual(
    presentationSlideResources(archive.slides.get(f.slideId)!),
  );
});

test('duplicated native slides retain animation targets while giving objects new authoring identities', () => {
  const f = fixture(),
    pkg = f.artifact.document.package,
    part = pkg.getPart(f.artifact.document.slides[0]!.part)!,
    shape = f.artifact.document.slides[0]!.objects[0]!;
  const timing = `<p:transition><p:fade/></p:transition><p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="clickEffect"><p:childTnLst><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="2" dur="400"/><p:tgtEl><p:spTgt spid="${shape.shapeId}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
  const source = openPresentationArtifact(
    beginPackageTransaction(pkg)
      .replacePart(
        part.name,
        new TextEncoder().encode(
          new TextDecoder().decode(pkg.readPart(part)).replace('</p:sld>', timing + '</p:sld>'),
        ),
      )
      .commit(),
  );
  expect(source.document.slides[0]!.animations).toHaveLength(1);
  const native = applyPresentationCommand(importNativePresentation(source), {
    name: 'insert-slide',
    index: 1,
    sourceId: f.slideId,
  });
  const slide = native.document.slides[1]!,
    target = slide.animations![0]!.target;
  expect(slide.objects.find((object) => object.shapeId === target)).toBeDefined();
  expect(slide.objects[0]!.key).not.toBe(source.document.slides[0]!.objects[0]!.key);
  const output = openPresentationArtifact(native.bytes()).document.slides[1]!;
  expect(slide.animations).toEqual(output.animations);
  expect(slide.transition).toEqual(output.transition);
});
