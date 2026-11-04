import type { OpcPackage } from '@tumblerjs/opc';
import { presentationResourceHash } from './native-resources.ts';
import { PresentationArtifact } from './artifact.ts';
import {
  applyPresentationCommand,
  presentationCommand,
  type PresentationCommand,
} from './commands.ts';
import {
  presentationTextTarget,
  slideTextValue,
  type PresentationTextEdit,
  type PresentationFormatChange,
  type PresentationShapeChange,
} from './editing.ts';
import type {
  PresentationDocument,
  PresentationSlide,
  SlideObject,
  PresentationObjectChange,
  OpenPresentationOptions,
} from './model.ts';
import { PresentationError } from './model.ts';
import { editNativeText } from './native-text.ts';
import {
  insertNativeObject,
  moveNativeObject,
  nativeGradient,
  nativeColour,
} from './native-shape.ts';
import { findPresentationMatches } from './search.ts';
import { nativeLayoutTemplate as layoutTemplate } from './native-layout.ts';
import { editNativeTable } from './native-table.ts';
import { insertNativeInk } from './native-ink.ts';
import {
  decodePresentationNativeArchive,
  openPresentationNativeArchive,
} from './native-archive.ts';
import { isPresentationBlock } from './native-block.ts';
import { openPresentationArtifact } from './artifact.ts';
import {
  presentationThemeColours,
  presentationRunDefaults,
  bindPresentationThemeColours,
} from './reader.ts';
import { ThemeColorScheme, THEME_COLOR_SLOTS } from '@tumblerjs/ooxml';

export type NativeSlide = {
  fonts?: PresentationDocument['embeddedFonts'];
  slide: PresentationSlide;
  palette: readonly (readonly [(typeof THEME_COLOR_SLOTS)[number], string | undefined])[];
  inheritedBackground: Pick<
    PresentationSlide,
    'background' | 'backgroundGradient' | 'backgroundPattern' | 'backgroundPicture'
  >;
};
export type NativeChange = {
  before: string;
  command: PresentationCommand;
  createdSlides: readonly string[];
  createdObjects: readonly { slideId: string; keys: readonly string[] }[];
};
export type NativePresentationState = {
  version: 1;
  revisionKey: string;
  width: number;
  height: number;
  conformance: PresentationDocument['conformance'];
  signed: boolean;
  embeddedFonts: PresentationDocument['embeddedFonts'];
  slides: readonly NativeSlide[];
  counter: number;
  changes: readonly NativeChange[];
};
export type NativePreservationSource = (() => PresentationArtifact) & {
  package?: () => OpcPackage;
};
type Chain = { previous: Chain | undefined; change: NativeChange };
/** Immutable native authoring state. Source markup is resolved only for explicit export. */
export class NativePresentationDocument extends PresentationArtifact {
  private exported: PresentationArtifact | undefined;
  private exportSlides = new Map<string, string>();
  private exportObjects = new Map<string, string>();
  constructor(
    readonly state: Omit<NativePresentationState, 'changes'>,
    private readonly source: NativePreservationSource,
    private readonly chain: Chain | undefined = undefined,
    options: OpenPresentationOptions = {},
  ) {
    let materialize = () => source();
    const document: PresentationDocument = {
      width: state.width,
      height: state.height,
      slides: state.slides.map((s) => s.slide),
      conformance: state.conformance,
      signed: state.signed,
      ...(state.embeddedFonts ? { embeddedFonts: state.embeddedFonts } : {}),
      get package() {
        return materialize().document.package;
      },
      get sources() {
        return materialize().document.sources;
      },
    };
    const fonts = state.slides.flatMap((s) => s.fonts ?? []);
    if (fonts.length)
      Object.assign(document, {
        embeddedFonts: [
          ...new Map(fonts.map((f) => [f.family + ':' + f.bold + ':' + f.italic, f])).values(),
        ],
      });
    super(document, options);
    materialize = () => this.exportArtifact();
    state.slides.forEach((s) =>
      bindPresentationThemeColours(
        document,
        s.slide.id,
        new ThemeColorScheme('Native', new Map(s.palette)),
      ),
    );
  }
  snapshot(): NativePresentationState {
    const changes: NativeChange[] = [];
    for (let node = this.chain; node; node = node.previous) changes.push(node.change);
    return { ...this.state, changes: changes.reverse() };
  }
  /** Unloaded slides retain commands for export without materializing their render model. */
  recordCommand(command: PresentationCommand): NativePresentationDocument {
    return new NativePresentationDocument(
      {
        ...this.state,
        revisionKey: presentationResourceHash(
          new TextEncoder().encode(
            this.state.revisionKey + ':' + this.state.counter + ':' + JSON.stringify(command),
          ),
        ),
      },
      this.source,
      {
        previous: this.chain,
        change: { command, before: this.state.revisionKey, createdSlides: [], createdObjects: [] },
      },
      this.options,
    );
  }
  advanceCounter(counter: number): NativePresentationDocument {
    return counter === this.state.counter
      ? this
      : new NativePresentationDocument(
          { ...this.state, counter },
          this.source,
          this.chain,
          this.options,
        );
  }
  sourceRevisionKey(): string {
    let node = this.chain;
    if (!node) return this.state.revisionKey;
    while (node.previous) node = node.previous;
    return node.change.before;
  }
  withSource(source: () => PresentationArtifact): NativePresentationDocument {
    const base = source();
    let chain = this.chain;
    if (base instanceof NativePresentationDocument) {
      if (base.state.revisionKey === this.state.revisionKey) chain = undefined;
      else {
        const suffix: NativeChange[] = [];
        let cursor = chain;
        while (cursor) {
          suffix.push(cursor.change);
          if (cursor.change.before === base.state.revisionKey) break;
          cursor = cursor.previous;
        }
        if (!cursor) throw new Error('Native export source does not match this branch.');
        chain = undefined;
        for (const change of suffix.reverse()) chain = { previous: chain, change };
      }
    }
    return new NativePresentationDocument(this.state, () => base, chain, this.options);
  }
  /** Loading another slide preserves the local branch and its export provenance. */
  hydrate(other: NativePresentationDocument, ids: ReadonlySet<string>): NativePresentationDocument {
    const slides = this.state.slides.map((s) =>
      ids.has(s.slide.id) ? (other.state.slides.find((n) => n.slide.id === s.slide.id) ?? s) : s,
    );
    return new NativePresentationDocument(
      { ...this.state, slides },
      this.source,
      this.chain,
      this.options,
    );
  }
  sameState(other: PresentationArtifact): boolean {
    return (
      this === other ||
      (other instanceof NativePresentationDocument &&
        this.state.revisionKey === other.state.revisionKey)
    );
  }
  preservationPackage() {
    return this.source.package?.() ?? this.source().document.package;
  }
  preservationSource() {
    return this.source();
  }
  /** Existing OOXML writers remain the lossless export reconciler, outside the editing path. */
  exportArtifact(): PresentationArtifact {
    if (this.exported) return this.exported;
    let artifact = this.source();
    const slides = new Map<string, string>(),
      objects = new Map<string, string>();
    for (const change of this.snapshot().changes) {
      let command = change.command;
      if (command.name === 'batch') throw new Error('Native changes must be atomic commands.');
      if ('slideId' in command)
        command = { ...command, slideId: slides.get(command.slideId) ?? command.slideId };
      if ('objectKey' in command)
        command = { ...command, objectKey: objects.get(command.objectKey) ?? command.objectKey };
      if (command.name === 'insert-slide')
        command = {
          ...command,
          ...(command.sourceId
            ? { sourceId: slides.get(command.sourceId) ?? command.sourceId }
            : {}),
          ...(command.layoutSourceId
            ? { layoutSourceId: slides.get(command.layoutSourceId) ?? command.layoutSourceId }
            : {}),
        };
      if (command.name === 'paste-object') {
        const bytes = Uint8Array.from(atob(command.source), (c) => c.charCodeAt(0));
        if (isPresentationBlock(bytes)) {
          const model = openPresentationNativeArchive(decodePresentationNativeArchive(bytes));
          const source = model.exportArtifact();
          let binary = '';
          for (const byte of source.bytes()) binary += String.fromCharCode(byte);
          command = {
            ...command,
            source: btoa(binary),
            sourceSlideId: model.exportSlides.get(command.sourceSlideId) ?? command.sourceSlideId,
            objectKey: model.exportObjects.get(command.objectKey) ?? command.objectKey,
          };
        }
      }
      const before = artifact;
      artifact = applyPresentationCommand(artifact, command);
      const added = artifact.document.slides.filter(
        (s) => !before.document.slides.some((p) => p.id === s.id),
      );
      change.createdSlides.forEach((id, i) => {
        const slide = added[i];
        if (!slide) throw new Error('Native export slide identity mismatch.');
        slides.set(id, slide.id);
      });
      for (const created of change.createdObjects) {
        const id = slides.get(created.slideId) ?? created.slideId;
        const old = before.document.slides.find((s) => s.id === id),
          next = artifact.document.slides.find((s) => s.id === id);
        const addedObjects =
          next?.objects.filter(
            (o) => o.layer === 'slide' && !old?.objects.some((p) => p.key === o.key),
          ) ?? [];
        created.keys.forEach((key, i) => {
          const object = addedObjects[i];
          if (!object) throw new Error('Native export object identity mismatch.');
          objects.set(key, object.key);
        });
      }
    }
    this.exportSlides = slides;
    this.exportObjects = objects;
    return (this.exported = artifact);
  }
  override bytes() {
    return this.exportArtifact().bytes();
  }
  override editText(command: PresentationTextEdit) {
    return this.nativeCommand({ name: 'edit-text', ...command });
  }
  override formatText(command: PresentationFormatChange) {
    return this.nativeCommand({ name: 'format-text', ...command });
  }
  override styleShape(command: PresentationShapeChange) {
    return this.nativeCommand({ name: 'style-shape', ...command });
  }
  override updateObject(command: PresentationObjectChange) {
    return this.nativeCommand({ name: 'update-object', ...command });
  }
  override readonly nativeCommand = (input: PresentationCommand): NativePresentationDocument => {
    const command = presentationCommand.parse(input);
    if (this.state.signed)
      throw new PresentationError('unsupported_edit', 'Signed presentations are read-only.');
    if (command.name === 'batch')
      return command.commands.reduce(
        (model, cmd) => model.nativeCommand(cmd),
        this as NativePresentationDocument,
      );
    const target =
      'slideId' in command
        ? this.state.slides.find((s) => s.slide.id === command.slideId)
        : undefined;
    if ('slideId' in command && !target) throw new Error('Slide not found.');
    const selected =
      'objectKey' in command && command.name !== 'paste-object'
        ? target?.slide.objects.find((o) => o.key === command.objectKey)
        : undefined;
    if (
      'objectKey' in command &&
      command.name !== 'paste-object' &&
      (!selected || selected.restriction)
    )
      throw new Error(selected?.restriction ?? 'Slide object not found.');
    let counter = this.state.counter,
      slides = this.state.slides;
    const nextId = () => `native-${++counter}`;
    const patchSlide = (state: NativeSlide) => {
      slides = slides.map((s) => (s === target ? state : s));
    };
    const patchObject = (object: SlideObject) => {
      if (!target || !selected) throw new Error('Select an object.');
      patchSlide({
        ...target,
        slide: {
          ...target.slide,
          objects: target.slide.objects.map((o) => (o === selected ? object : o)),
        },
      });
    };
    const createdSlides: string[] = [],
      createdObjects: { slideId: string; keys: string[] }[] = [];
    const addObjects = (slideId: string, objects: readonly SlideObject[]) => {
      createdObjects.push({
        slideId,
        keys: objects.filter((o) => o.layer === 'slide').map((o) => o.key),
      });
    };
    switch (command.name) {
      case 'edit-text':
      case 'format-text':
      case 'paragraph': {
        const object = presentationTextTarget(selected!, command.cell);
        if (!object.textEditable || !object.text) throw new Error('This text is read-only.');
        const text = editNativeText(object.text, command);
        patchObject(
          command.cell
            ? {
                ...selected!,
                table: {
                  ...selected!.table!,
                  cells: selected!.table!.cells.map((c) =>
                    c.row === command.cell!.row && c.column === command.cell!.column
                      ? { ...c, text }
                      : c,
                  ),
                },
              }
            : { ...selected!, text },
        );
        break;
      }
      case 'edit-table':
        if (!selected!.table) throw new Error('Select a table.');
        patchObject({ ...selected!, table: editNativeTable(selected!.table, command) });
        break;
      case 'update-object':
        if (!selected!.movable) throw new Error('This object cannot be moved.');
        patchObject(moveNativeObject(selected!, command));
        break;
      case 'style-shape': {
        const gradient =
          typeof command.fill === 'object'
            ? nativeGradient(command.fill)
            : command.fill === undefined
              ? selected!.gradient
              : undefined;
        patchObject({
          ...selected!,
          fill: typeof command.fill === 'string' ? nativeColour(command.fill) : selected!.fill,
          gradient,
          stroke: command.stroke === undefined ? selected!.stroke : nativeColour(command.stroke),
          strokeWidth: command.strokeWidth ?? selected!.strokeWidth,
          cornerRadius: command.cornerRadius ?? selected!.cornerRadius,
        });
        break;
      }
      case 'delete-object':
        patchSlide({
          ...target!,
          slide: { ...target!.slide, objects: target!.slide.objects.filter((o) => o !== selected) },
        });
        break;
      case 'duplicate-object': {
        const key = nextId();
        let object = { ...selected!, key, shapeId: key };
        object = moveNativeObject(object, {
          name: 'update-object',
          slideId: command.slideId,
          objectKey: key,
          ...object.transform,
          x: object.transform.x + 16,
          y: object.transform.y + 16,
        });
        patchSlide({
          ...target!,
          slide: { ...target!.slide, objects: [...target!.slide.objects, object] },
        });
        addObjects(command.slideId, [object]);
        break;
      }
      case 'insert-ink': {
        const key = nextId(),
          object = insertNativeInk(command, key, target!.slide.part);
        patchSlide({
          ...target!,
          slide: { ...target!.slide, objects: [...target!.slide.objects, object] },
        });
        addObjects(command.slideId, [object]);
        break;
      }
      case 'paste-object': {
        const bytes = Uint8Array.from(atob(command.source), (c) => c.charCodeAt(0));
        const source = isPresentationBlock(bytes)
          ? openPresentationNativeArchive(decodePresentationNativeArchive(bytes))
          : importNativePresentation(openPresentationArtifact(bytes));
        const object = source.document.slides
          .find((s) => s.id === command.sourceSlideId)
          ?.objects.find((o) => o.key === command.objectKey);
        if (!object || object.layer !== 'slide' || object.restriction)
          throw new Error('Copy an editable slide object.');
        if (source.state.conformance !== this.state.conformance)
          throw new Error('Clipboard objects must use the destination presentation conformance.');
        const key = nextId(),
          copy = { ...object, key, shapeId: key, sourcePart: target!.slide.part };
        patchSlide({
          ...target!,
          slide: { ...target!.slide, objects: [...target!.slide.objects, copy] },
        });
        addObjects(command.slideId, [copy]);
        break;
      }
      case 'insert-object': {
        const key = nextId(),
          object = insertNativeObject(command, key, key, target!.slide.part);
        patchSlide({
          ...target!,
          slide: { ...target!.slide, objects: [...target!.slide.objects, object] },
        });
        addObjects(command.slideId, [object]);
        break;
      }
      case 'set-slide-hidden':
        patchSlide({ ...target!, slide: { ...target!.slide, hidden: command.hidden } });
        break;
      case 'delete-slide':
        if (slides.length <= 1) throw new Error('Keep at least one slide.');
        slides = slides.filter((s) => s !== target);
        break;
      case 'move-slide': {
        if (command.index >= slides.length) throw new RangeError('Invalid slide position.');
        const order = slides.filter((s) => s !== target);
        order.splice(command.index, 0, target!);
        slides = order;
        break;
      }
      case 'insert-slide': {
        if (command.index > slides.length) throw new RangeError('Invalid slide position.');
        const donor =
          slides.find((s) => s.slide.id === (command.sourceId ?? command.layoutSourceId)) ??
          slides[Math.max(0, command.index - 1)];
        if ((command.sourceId || command.layoutSourceId) && !donor)
          throw new Error('Source slide not found.');
        const id = nextId(),
          template = command.sourceId
            ? donor!.slide
            : layoutTemplate(
                command.layoutSourceId ? 'title-content' : 'blank',
                this.state.width,
                this.state.height,
              );
        const part = `/native/${id}.xml`,
          objects = template.objects.map((o) => ({
            ...o,
            key: nextId(),
            shapeId: `native-${counter}`,
            sourcePart: o.layer === 'slide' ? part : o.sourcePart,
          }));
        const slide = {
          ...template,
          id,
          part,
          notes: command.sourceId ? '' : template.notes,
          objects,
        };
        const next = {
          slide,
          palette: donor?.palette ?? [],
          inheritedBackground: donor?.inheritedBackground ?? {
            background: '#FFFFFF',
            backgroundGradient: undefined,
          },
        };
        const order = [...slides];
        order.splice(command.index, 0, next);
        slides = order;
        createdSlides.push(id);
        addObjects(id, objects);
        break;
      }
      case 'layout': {
        const template = layoutTemplate(command.layout, this.state.width, this.state.height),
          placeholders = target!.slide.objects.filter(
            (o) => o.layer === 'slide' && o.placeholder && o.textEditable,
          ),
          used = new Set<SlideObject>();
        const title = (s: string) => s === 'title' || s === 'ctrTitle';
        const objects = template.objects.map((o) => {
          const match = placeholders.find(
            (p) => !used.has(p) && title(p.placeholder!) === title(o.placeholder!),
          );
          if (match) used.add(match);
          const key = match?.key ?? nextId();
          return {
            ...o,
            key,
            shapeId: match?.shapeId ?? key,
            sourcePart: target!.slide.part,
            text: match?.text ? { ...o.text!, paragraphs: match.text.paragraphs } : o.text,
          };
        });
        const kept = target!.slide.objects.filter(
          (o) => !placeholders.includes(o) || (!used.has(o) && !!slideTextValue(o)),
        );
        patchSlide({ ...target!, slide: { ...target!.slide, objects: [...kept, ...objects] } });
        addObjects(
          command.slideId,
          objects.filter((o) => !target!.slide.objects.some((p) => p.key === o.key)),
        );
        break;
      }
      case 'arrange': {
        const object = selected!,
          t = object.transform;
        if (['left', 'center', 'right', 'top', 'middle', 'bottom'].includes(command.action))
          return this.nativeCommand({
            name: 'update-object',
            slideId: command.slideId,
            objectKey: command.objectKey,
            ...t,
            x:
              command.action === 'left'
                ? 0
                : command.action === 'center'
                  ? (this.state.width - t.width) / 2
                  : command.action === 'right'
                    ? this.state.width - t.width
                    : t.x,
            y:
              command.action === 'top'
                ? 0
                : command.action === 'middle'
                  ? (this.state.height - t.height) / 2
                  : command.action === 'bottom'
                    ? this.state.height - t.height
                    : t.y,
          });
        const list = [...target!.slide.objects],
          at = list.indexOf(object);
        list.splice(at, 1);
        const index =
          command.action === 'front'
            ? list.length
            : command.action === 'back'
              ? 0
              : command.action === 'forward'
                ? Math.min(at + 1, list.length)
                : Math.max(at - 1, 0);
        list.splice(index, 0, object);
        patchSlide({ ...target!, slide: { ...target!.slide, objects: list } });
        break;
      }
      case 'background':
      case 'set-background': {
        const fill =
          command.name === 'background'
            ? { kind: 'solid' as const, color: command.color }
            : command.fill;
        let slide = {
          ...target!.slide,
          backgroundGradient: undefined as PresentationSlide['backgroundGradient'],
          backgroundPattern: undefined,
          backgroundPicture: undefined,
        } as PresentationSlide;
        if (fill.kind === 'inherit') slide = { ...slide, ...target!.inheritedBackground };
        if (fill.kind === 'solid')
          slide = { ...slide, background: nativeColour(fill.color, fill.opacity ?? 1) };
        if (fill.kind === 'gradient')
          slide = { ...slide, background: 'none', backgroundGradient: nativeGradient(fill) };
        if (fill.kind === 'pattern')
          slide = {
            ...slide,
            background: 'none',
            backgroundPattern: {
              preset: fill.preset,
              foreground: nativeColour(fill.foreground),
              background: nativeColour(fill.background),
            },
          };
        if (fill.kind === 'picture')
          slide = {
            ...slide,
            background: 'none',
            backgroundPicture: {
              bytes: Uint8Array.from(atob(fill.data), (c) => c.charCodeAt(0)),
              contentType: fill.contentType,
              crop: fill.crop ?? [0, 0, 0, 0],
              opacity: fill.opacity ?? 1,
              ...(fill.tile
                ? {
                    tile: {
                      ...fill.tile,
                      x: fill.tile.x ?? 0,
                      y: fill.tile.y ?? 0,
                      align: fill.tile.align ?? 'tl',
                      flip: fill.tile.flip ?? 'none',
                    },
                  }
                : {}),
            },
          };
        patchSlide({ ...target!, slide });
        break;
      }
      case 'replace-all': {
        let result: NativePresentationDocument = this;
        for (const { editable, ...match } of findPresentationMatches(this.document, command.find, {
          matchCase: command.caseSensitive,
          wholeWord: command.wholeWord ?? false,
        }).reverse())
          if (editable)
            result = result.nativeCommand({ name: 'edit-text', ...match, value: command.value });
        return result;
      }
      default: {
        const exhaustive: never = command;
        throw new Error(`Unsupported native command: ${exhaustive}`);
      }
    }
    return new NativePresentationDocument(
      {
        ...this.state,
        slides,
        counter,
        revisionKey: presentationResourceHash(
          new TextEncoder().encode(
            this.state.revisionKey + ':' + this.state.counter + ':' + JSON.stringify(command),
          ),
        ),
      },
      this.source,
      {
        previous: this.chain,
        change: { command, before: this.state.revisionKey, createdSlides, createdObjects },
      },
      this.options,
    );
  };
}

export function importNativePresentation(
  artifact: PresentationArtifact,
): NativePresentationDocument {
  if (artifact instanceof NativePresentationDocument) return artifact;
  const doc = artifact.document;
  const nativeText = (text: SlideObject['text']) =>
    text && {
      ...text,
      paragraphs: text.paragraphs.map((p) => ({
        ...p,
        runs: p.runs.map((run) => {
          const inherited = presentationRunDefaults(run);
          if (!inherited) return run;
          const { text, ...nativeDefaults } = inherited;
          return { ...run, nativeDefaults };
        }),
        ...(p.endRun
          ? {
              endRun: {
                ...p.endRun,
                nativeDefaults: presentationRunDefaults(p.endRun) ?? p.endRun,
              },
            }
          : {}),
      })),
    };
  const slides = doc.slides.map((original) => {
    const slide = {
      ...original,
      objects: original.objects.map((o) => ({
        ...o,
        text: nativeText(o.text),
        table: o.table && {
          ...o.table,
          cells: o.table.cells.map((c) => ({ ...c, text: nativeText(c.text) })),
        },
      })),
    };
    const scheme = presentationThemeColours(doc, slide.id);
    return {
      slide,
      fonts: doc.embeddedFonts?.filter((font) =>
        slide.objects.some((o) =>
          [
            ...(o.text?.paragraphs ?? []),
            ...(o.table?.cells.flatMap((c) => c.text?.paragraphs ?? []) ?? []),
          ].some((p) =>
            [...p.runs, ...(p.endRun ? [p.endRun] : [])].some((r) => r.fontFamily === font.family),
          ),
        ),
      ),
      palette: THEME_COLOR_SLOTS.map((slot) => [slot, scheme.color(slot)] as const),
      inheritedBackground: {
        background: slide.background,
        backgroundGradient: slide.backgroundGradient,
        backgroundPattern: slide.backgroundPattern,
        backgroundPicture: slide.backgroundPicture,
      },
    };
  });
  return new NativePresentationDocument(
    {
      version: 1,
      revisionKey: presentationResourceHash(artifact.bytes()),
      width: doc.width,
      height: doc.height,
      conformance: doc.conformance,
      signed: doc.signed,
      embeddedFonts: undefined,
      slides,
      counter: 0,
    },
    () => artifact,
    undefined,
    artifact.options,
  );
}

export function restoreNativePresentation(
  state: NativePresentationState,
  source: NativePreservationSource,
  options: OpenPresentationOptions = {},
): NativePresentationDocument {
  let chain: Chain | undefined;
  for (const change of state.changes) chain = { previous: chain, change };
  return new NativePresentationDocument(state, source, chain, options);
}
