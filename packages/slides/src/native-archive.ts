import { LosslessXmlDocument } from '@tumblerjs/ooxml';
import {
  presentationResourceHash,
  encodeNativeSlide,
  decodeNativeSlide,
} from './native-resources.ts';
import { registerPresentationNativeReader } from './native-open.ts';
import { ContentTypes, OpcPackage, PartName, ZipArchive, nativeCodec } from '@tumblerjs/opc';
import { z } from 'zod';
import { openPresentationArtifact, PresentationArtifact } from './artifact.ts';
import {
  NativePresentationDocument,
  importNativePresentation,
  restoreNativePresentation,
  type NativePresentationState,
} from './native-document.ts';
import { encodePresentationBlock, decodePresentationBlock } from './native-block.ts';
import type { OpenPresentationOptions } from './model.ts';

const preservationCodecs = [
  nativeCodec(
    'part-name',
    (v): v is PartName => v instanceof PartName,
    (v) => v.value,
    (v) => PartName.parse(v),
  ),
  nativeCodec(
    'zip-members',
    (v): v is ZipArchive => v instanceof ZipArchive,
    (v) => v.snapshot(),
    (v) => ZipArchive.fromSnapshot(v),
  ),
  nativeCodec(
    'content-types',
    (v): v is ContentTypes => v instanceof ContentTypes,
    (v) => ({ defaults: v.defaults, overrides: v.overrides }),
    (v) => new ContentTypes(v.defaults, v.overrides),
  ),
  nativeCodec(
    'opc-parts',
    (v): v is OpcPackage => v instanceof OpcPackage,
    (v) => ({ archive: v.archive, types: v.contentTypes, parts: v.parts }),
    (v) => new OpcPackage(v.archive, v.types, v.parts),
  ),
];
const preservationBlocks = new WeakMap<OpcPackage, Uint8Array>();
function encodePreservation(pkg: OpcPackage) {
  let bytes = preservationBlocks.get(pkg);
  if (!bytes) {
    bytes = encodePresentationBlock(pkg, preservationCodecs);
    preservationBlocks.set(pkg, bytes);
  }
  return bytes;
}
const packageRoot = z.instanceof(OpcPackage);
const header = z.object({
  version: z.literal(1),
  revisionKey: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.number().positive(),
  height: z.number().positive(),
  conformance: z.enum(['strict', 'transitional']),
  signed: z.boolean(),
  counter: z.number().int().nonnegative(),
  changes: z.array(z.custom<NativePresentationState['changes'][number]>()),
  embeddedFonts: z.custom<NativePresentationState['embeddedFonts']>().optional(),
  slides: z.array(
    z.object({ id: z.string(), part: z.string(), title: z.string(), hidden: z.boolean() }),
  ),
});
export type NativePresentationManifest = z.infer<typeof header>;
export interface NativePresentationArchive {
  readonly version: 1;
  readonly allowPendingResources?: boolean | undefined;
  readonly manifest: Uint8Array;
  readonly slides: ReadonlyMap<string, Uint8Array>;
  readonly preservation: Uint8Array;
  readonly resources?: ReadonlyMap<string, Uint8Array> | undefined;
}

/** Conversion owns preservation separately from independently loadable compiled slide models. */
export function createPresentationNativeArchive(
  input: PresentationArtifact,
): NativePresentationArchive {
  const model = importNativePresentation(input),
    snapshot = model.snapshot();
  const { slides, ...metadata } = snapshot;
  const compiled = slides.map((slide) => ({ id: slide.slide.id, ...encodeNativeSlide(slide) }));
  return {
    version: 1,
    manifest: encodePresentationBlock({
      ...metadata,
      slides: slides.map(({ slide }) => ({
        id: slide.id,
        part: slide.part,
        title: slide.title,
        hidden: slide.hidden,
      })),
    }),
    slides: new Map(compiled.map((slide) => [slide.id, slide.model])),
    resources: new Map(compiled.flatMap((slide) => [...slide.resources])),
    preservation: encodePreservation(model.preservationPackage()),
  };
}

/** Current compiled views omit export history and preservation entirely. Blocks reuse immutable slide identities. */
export function createPresentationNativeView(
  input: PresentationArtifact,
): Pick<NativePresentationArchive, 'version' | 'manifest' | 'slides' | 'resources'> {
  const model = importNativePresentation(input),
    { slides, ...metadata } = model.state;
  const compiled = slides.map((slide) => ({ id: slide.slide.id, ...encodeNativeSlide(slide) }));
  return {
    version: 1,
    manifest: encodePresentationBlock({
      ...metadata,
      changes: [],
      slides: slides.map(({ slide }) => ({
        id: slide.id,
        part: slide.part,
        title: slide.title,
        hidden: slide.hidden,
      })),
    }),
    slides: new Map(compiled.map((slide) => [slide.id, slide.model])),
    resources: new Map(compiled.flatMap((slide) => [...slide.resources])),
  };
}

export function readPresentationNativeManifest(bytes: Uint8Array): NativePresentationManifest {
  const result = header.parse(decodePresentationBlock(bytes));
  if (new Set(result.slides.map((s) => s.id)).size !== result.slides.length)
    throw new TypeError('Duplicate native slide identity.');
  return result;
}

/** Partial archives can paint/edit a loaded slide without resolving export-only preservation. */
export function openPresentationNativeArchive(
  archive: Pick<NativePresentationArchive, 'version' | 'manifest' | 'slides' | 'resources'> & {
    readonly preservation?: Uint8Array;
    readonly allowPendingResources?: boolean | undefined;
  },
  options: OpenPresentationOptions = {},
): NativePresentationDocument {
  if (archive.version !== 1) throw new TypeError('Unsupported native presentation version.');
  const metadata = readPresentationNativeManifest(archive.manifest);
  const slides = metadata.slides.map((descriptor) => {
    const block = archive.slides.get(descriptor.id);
    if (block) {
      const result = decodeNativeSlide(
        block,
        archive.resources ?? new Map(),
        archive.allowPendingResources ?? false,
      );
      if (result.slide.id !== descriptor.id || result.slide.part !== descriptor.part)
        throw new TypeError('Native slide identity mismatch.');
      return result;
    }
    return {
      slide: {
        ...descriptor,
        notes: '',
        background: '#FFFFFF',
        backgroundGradient: undefined,
        objects: [],
        diagnostics: [],
      },
      palette: [],
      inheritedBackground: { background: '#FFFFFF', backgroundGradient: undefined },
    };
  });
  let source: PresentationArtifact | undefined, pkg: OpcPackage | undefined;
  const packageSource = () => {
    if (pkg) return pkg;
    if (!archive.preservation?.length)
      throw new Error('Presentation preservation resources have not loaded.');
    return (pkg = packageRoot.parse(
      decodePresentationBlock(archive.preservation, preservationCodecs),
    ));
  };
  const sourceArtifact = Object.assign(
    () => (source ??= openPresentationArtifact(packageSource().archive.originalBytes(), options)),
    { package: packageSource },
  );
  const model = restoreNativePresentation(
    { ...metadata, embeddedFonts: metadata.embeddedFonts, slides },
    sourceArtifact,
    options,
  );
  return archive.preservation?.length ? model.completeChartContents() : model;
}

/** Recovery stores the native branch without forcing export preservation to load. */
export function encodePresentationNativeState(
  input: PresentationArtifact,
  options: { includeResources?: boolean } = {},
): Uint8Array {
  const model = importNativePresentation(input),
    { slides, ...metadata } = model.snapshot();
  const compiled = slides.map((slide) => ({ id: slide.slide.id, ...encodeNativeSlide(slide) }));
  return encodePresentationNativeArchive({
    version: 1,
    manifest: encodePresentationBlock({
      ...metadata,
      slides: slides.map(({ slide }) => ({
        id: slide.id,
        part: slide.part,
        title: slide.title,
        hidden: slide.hidden,
      })),
    }),
    slides: new Map(compiled.map((s) => [s.id, s.model])),
    resources:
      options.includeResources === false
        ? new Map()
        : new Map(compiled.flatMap((s) => [...s.resources])),
    allowPendingResources: true,
    preservation: new Uint8Array(),
  });
}

/** Complete envelopes are for export workers and recovery, never a prerequisite for first slide paint. */
export function encodePresentationNativeArchive(archive: NativePresentationArchive): Uint8Array {
  return encodePresentationBlock({
    version: archive.version,
    allowPendingResources: archive.allowPendingResources ?? !archive.preservation.length,
    manifest: archive.manifest,
    slides: archive.slides,
    preservation: archive.preservation,
    resources: archive.resources ?? new Map(),
  });
}
export function decodePresentationNativeArchive(bytes: Uint8Array): NativePresentationArchive {
  return z
    .object({
      version: z.literal(1),
      allowPendingResources: z.boolean().optional(),
      manifest: z.instanceof(Uint8Array),
      slides: z.map(z.string(), z.instanceof(Uint8Array)),
      preservation: z.instanceof(Uint8Array),
      resources: z.map(z.string(), z.instanceof(Uint8Array)).optional(),
    })
    .parse(decodePresentationBlock(bytes));
}

registerPresentationNativeReader((bytes, options) =>
  openPresentationNativeArchive(decodePresentationNativeArchive(bytes), options),
);

/** Compare compiled authoring semantics independently of object sharing and source cache residency. */
export function presentationNativeContent(artifact: PresentationArtifact): string {
  const { width, height, conformance, signed, slides } = importNativePresentation(artifact).document;
  return JSON.stringify({ width, height, conformance, signed, slides }, (key, value: unknown) => {
    if (key === 'nativeDefaults' || key === 'nativeFonts') return undefined;
    if (value instanceof Uint8Array)
      return { binary: presentationResourceHash(value), length: value.length };
    if (value instanceof LosslessXmlDocument)
      return { xml: presentationResourceHash(value.originalBytes()) };
    if (value instanceof Map) return [...value];
    if (value && typeof value === 'object' && !Array.isArray(value))
      return Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      );
    return value;
  });
}
