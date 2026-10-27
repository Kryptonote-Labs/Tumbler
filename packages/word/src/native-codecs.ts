import { ContentTypes, OpcPackage, PartName, ZipArchive } from '@tumblerjs/opc';
import { LosslessXmlDocument, ThemeColorScheme, ThemeFontScheme, THEME_COLOR_SLOTS } from '@tumblerjs/ooxml';
import { WordArtifact } from './artifact.ts';
import { WordDocument } from './document.ts';
import { WordStyles } from './styles.ts';
import { WordNumbering } from './numbering.ts';
import { WordNumberingStyles } from './numbering-styles.ts';
import { NativeWordSource } from './native-source.ts';
import { nativeCodec } from './native-graph.ts';

// Explicit constructors preserve engine behavior and reject unregistered object types.
// Adding a class or changing its serialized shape requires a native format revision.
export const wordNativeCodecs = [
  nativeCodec('part-name', (value): value is PartName => value instanceof PartName,
    value => value.value, value => PartName.parse(value)),
  nativeCodec('zip-members', (value): value is ZipArchive => value instanceof ZipArchive,
    value => value.snapshot(), value => ZipArchive.fromSnapshot(value)),
  nativeCodec('content-types', (value): value is ContentTypes => value instanceof ContentTypes,
    value => ({ defaults: value.defaults, overrides: value.overrides }),
    value => new ContentTypes(value.defaults, value.overrides)),
  nativeCodec('opc-parts', (value): value is OpcPackage => value instanceof OpcPackage,
    value => ({ archive: value.archive, types: value.contentTypes, parts: value.parts }),
    value => new OpcPackage(value.archive, value.types, value.parts)),
  nativeCodec('xml-preservation', (value): value is LosslessXmlDocument => value instanceof LosslessXmlDocument,
    value => value.originalBytes(),
    value => new LosslessXmlDocument(value)),
  nativeCodec('theme-colours', (value): value is ThemeColorScheme => value instanceof ThemeColorScheme,
    value => ({ name: value.name, colours: new Map(THEME_COLOR_SLOTS.map(slot => [slot, value.color(slot)])) }),
    value => new ThemeColorScheme(value.name, value.colours)),
  nativeCodec('theme-fonts', (value): value is ThemeFontScheme => value instanceof ThemeFontScheme,
    value => ({ name: value.name, major: value.major, minor: value.minor }),
    value => new ThemeFontScheme(value.name, value.major, value.minor)),
  nativeCodec('word-styles', (value): value is WordStyles => value instanceof WordStyles,
    value => ({ partName: value.partName, styles: value.styles, documentRunDefaults: value.documentRunDefaults,
      documentParagraphDefaults: value.documentParagraphDefaults, themeColors: value.themeColors, themeFonts: value.themeFonts }),
    value => new WordStyles({
      styles: value.styles, documentRunDefaults: value.documentRunDefaults, documentParagraphDefaults: value.documentParagraphDefaults,
      ...(value.partName === undefined ? {} : { partName: value.partName }),
      ...(value.themeColors === undefined ? {} : { themeColors: value.themeColors }),
      ...(value.themeFonts === undefined ? {} : { themeFonts: value.themeFonts }),
    })),
  nativeCodec('numbering-styles', (value): value is WordNumberingStyles => value instanceof WordNumberingStyles,
    value => value.snapshot(), value => WordNumberingStyles.fromSnapshot(value)),
  nativeCodec('word-numbering', (value): value is WordNumbering => value instanceof WordNumbering,
    value => value.snapshot(), value => new WordNumbering({
      abstracts: value.abstracts, instances: value.instances, styles: value.styles,
      ...(value.partName === undefined ? {} : { partName: value.partName }),
    })),
  nativeCodec('word-document', (value): value is WordDocument => value instanceof WordDocument,
    value => ({ ...value }),
    value => {
      const { background, package: pkg, ...input } = value;
      return new WordDocument({ ...input, pkg, ...(background === undefined ? {} : { background }) });
    }),
  nativeCodec('word-artifact', (value): value is WordArtifact => value instanceof WordArtifact,
    value => value.document, value => new WordArtifact(value)),
  nativeCodec('native-word-source', (value): value is NativeWordSource => value instanceof NativeWordSource,
    value => value.snapshot(), value => new NativeWordSource(value.artifact, value)),
];
