import { compactNativeChanges } from './native-changes.ts';
import { applyNativeModelCommand } from './native-command.ts';
import type { OpcPackage } from '@tumblerjs/opc';
import {
  presentationResourceHash,
  encodeNativeSlide,
  decodeNativeSlide,
  hasAvailablePresentationResources,
} from './native-resources.ts';
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

import { findPresentationMatches } from './search.ts';
import {
  decodePresentationNativeArchive,
  openPresentationNativeArchive,
} from './native-archive.ts';
import { isPresentationBlock } from './native-block.ts';
import { openPresentationArtifact } from './artifact.ts';
import {
  presentationThemeColours,
  presentationInheritedBackground,
  presentationRunDefaults,
  presentationRunFonts,
  presentationNativeFonts,
  bindPresentationThemeColours,
} from './reader.ts';
import { ThemeColorScheme, THEME_COLOR_SLOTS } from '@tumblerjs/ooxml';

export type NativeSlide = {
  themeFonts?: import('@tumblerjs/ooxml').ThemeFontScheme | undefined;
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
const embeddedFontSets = new WeakMap<
  NativePreservationSource,
  {
    parts: readonly NonNullable<PresentationDocument['embeddedFonts']>[];
    merged: NonNullable<PresentationDocument['embeddedFonts']>;
  }
>();
function embeddedFonts(
  state: Omit<NativePresentationState, 'changes'>,
  source: NativePreservationSource,
) {
  const parts = [state.embeddedFonts, ...state.slides.map((slide) => slide.fonts)].filter(
    (fonts): fonts is NonNullable<typeof fonts> => !!fonts?.length,
  );
  if (!parts.length) return;
  const saved = embeddedFontSets.get(source);
  if (
    saved &&
    parts.length === saved.parts.length &&
    parts.every((part, i) => part === saved.parts[i])
  )
    return saved.merged;
  const merged = [
    ...new Map(
      parts.flat().map((font) => [font.family + ':' + font.bold + ':' + font.italic, font]),
    ).values(),
  ];
  embeddedFontSets.set(source, { parts, merged });
  return merged;
}
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
    const fonts = embeddedFonts(state, source);
    if (fonts) Object.assign(document, { embeddedFonts: fonts });
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
    return { ...this.state, changes: compactNativeChanges(changes.reverse()) };
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
    if (!(base instanceof NativePresentationDocument))
      return new NativePresentationDocument(this.state, source, this.chain, this.options);
    const suffix: NativeChange[] = [];
    if (base.state.revisionKey !== this.state.revisionKey) {
      let cursor = this.chain;
      while (cursor) {
        suffix.push(cursor.change);
        if (cursor.change.before === base.state.revisionKey) break;
        cursor = cursor.previous;
      }
      if (!cursor) throw new Error('Native export source does not match this branch.');
    }
    let chain = base.chain;
    for (const change of suffix.reverse()) chain = { previous: chain, change };
    return new NativePresentationDocument(this.state, base.source, chain, this.options);
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
  /** Attach arriving media to the current branch, preserving edits accepted during its download. */
  hydrateResources(
    resources: ReadonlyMap<string, Uint8Array>,
    ids: ReadonlySet<string>,
  ): NativePresentationDocument {
    const slides = this.state.slides.map((slide) => {
      if (!ids.has(slide.slide.id) || !hasAvailablePresentationResources(slide, resources))
        return slide;
      const encoded = encodeNativeSlide(slide),
        decoded = decodeNativeSlide(
          encoded.model,
          new Map([...encoded.resources, ...resources]),
          true,
        );
      return {
        ...slide,
        fonts: hasAvailablePresentationResources(slide.fonts, resources)
          ? decoded.fonts
          : slide.fonts,
        inheritedBackground: hasAvailablePresentationResources(slide.inheritedBackground, resources)
          ? decoded.inheritedBackground
          : slide.inheritedBackground,
        slide: {
          ...slide.slide,
          backgroundPicture: hasAvailablePresentationResources(
            slide.slide.backgroundPicture,
            resources,
          )
            ? decoded.slide.backgroundPicture
            : slide.slide.backgroundPicture,
          objects: slide.slide.objects.map((object, i) =>
            hasAvailablePresentationResources(object, resources)
              ? decoded.slide.objects[i]!
              : object,
          ),
        },
      };
    });
    return slides.every((slide, i) => slide === this.state.slides[i])
      ? this
      : new NativePresentationDocument(
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
    if (!this.chain) return this.preservationPackage().archive.originalBytes();
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
    if (command.name === 'replace-all') {
      let result: NativePresentationDocument = this;
      for (const { editable, ...match } of findPresentationMatches(this.document, command.find, {
        matchCase: command.caseSensitive,
        wholeWord: command.wholeWord ?? false,
      }).reverse())
        if (editable)
          result = result.nativeCommand({ name: 'edit-text', ...match, value: command.value });
      return result;
    }
    const applied = applyNativeModelCommand(this.state, command);
    return new NativePresentationDocument(
      {
        ...applied.state,
        revisionKey: presentationResourceHash(
          new TextEncoder().encode(
            this.state.revisionKey +
              ':' +
              this.state.counter +
              ':' +
              JSON.stringify(applied.change.command),
          ),
        ),
      },
      this.source,
      { previous: this.chain, change: applied.change },
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
          return {
            ...run,
            nativeFonts: presentationRunFonts(run),
            nativeDefaults: { ...nativeDefaults, nativeFonts: presentationRunFonts(inherited) },
          };
        }),
        ...(p.endRun
          ? {
              endRun: {
                ...p.endRun,
                nativeFonts: presentationRunFonts(p.endRun),
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
      themeFonts: presentationNativeFonts(doc, original.id),
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
      inheritedBackground: presentationInheritedBackground(original) ?? {
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
