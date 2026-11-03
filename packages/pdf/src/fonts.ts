import "./buffer-runtime.ts";
import { winAnsi, glyphText, standardName } from "./font-encodings.ts";
import { Buffer } from "buffer";
import { create, type Font as OutlineFont } from "fontkit";
import { Encodings, Font } from "@pdf-lib/standard-fonts";
import { PdfCMap, type PdfCode } from "./cmap.ts";
import {
  array,
  dictionary,
  integer,
  invalid,
  name,
  number,
  PdfName,
  PdfStream,
  type PdfDictionary,
  type PdfValue,
  unsupported,
} from "./objects.ts";
import type { PdfSource } from "./source.ts";
import { matrix, type PdfMatrix } from "./matrix.ts";
import { cffOpenType } from "./cff-container.ts";

export interface PdfGlyph {
  readonly code: number;
  readonly codeLength: number;
  readonly cid: number;
  readonly glyphId: number;
  readonly unicode: string;
  readonly width: number;
  readonly path: string | undefined;
  readonly procedure: PdfStream | undefined;
  readonly vertical: readonly [number, number, number] | undefined;
}
/** Font decoding preserves source codes, CIDs, glyph ids and extracted Unicode separately. */
export class PdfFont {
  readonly kind: string;
  readonly baseName: string;
  readonly fontMatrix: PdfMatrix;
  readonly resources: PdfDictionary;
  readonly unitsPerEm: number;
  readonly css: { family: string; weight: string; style: string };
  readonly vertical: boolean;
  private readonly mapping: PdfCMap;
  private readonly unicode: PdfCMap;
  private readonly outline: OutlineFont | undefined;
  private readonly standard: Font | undefined;
  private readonly simple = new Map<number, { unicode: string; glyph: string }>();
  private readonly widths = new Map<number, number>();
  private readonly verticalWidths = new Map<number, readonly [number, number, number]>();
  private readonly paths = new Map<number, string>();
  private outlineNames: Map<string, number> | undefined;
  private rawCff = false;
  private readonly cidMap: Uint8Array | undefined;
  private readonly defaultWidth: number;
  private readonly defaultVertical: readonly [number, number];

  constructor(
    readonly source: PdfSource,
    readonly dictionary: PdfDictionary,
  ) {
    this.kind = name(dictionary.get("Subtype"));
    this.baseName = name(dictionary.get("BaseFont"), "Helvetica");
    const encoding = source.resolve(dictionary.get("Encoding"));
    this.mapping =
      encoding instanceof PdfStream ? new PdfCMap(source.stream(encoding)) : new PdfCMap();
    if (
      this.kind === "Type0" &&
      encoding instanceof PdfName &&
      !["Identity-H", "Identity-V"].includes(encoding.value)
    )
      unsupported(`Predefined font CMap /${encoding.value} needs its registered CMap resource.`);
    this.vertical =
      encoding instanceof PdfName ? encoding.value.endsWith("-V") : this.mapping.vertical;
    const unicode = source.resolve(dictionary.get("ToUnicode"));
    this.unicode =
      unicode instanceof PdfStream ? new PdfCMap(source.stream(unicode)) : new PdfCMap();
    this.fontMatrix = matrix(
      source.resolve(dictionary.get("FontMatrix")),
      [0.001, 0, 0, 0.001, 0, 0],
    );
    this.resources = dictionary.has("Resources")
      ? this.sourceDictionary(dictionary.get("Resources"))
      : new Map();
    const metrics =
      this.kind === "Type0"
        ? this.sourceDictionary(array(source.resolve(dictionary.get("DescendantFonts")))[0])
        : dictionary;
    const descriptor = metrics.has("FontDescriptor")
      ? this.sourceDictionary(metrics.get("FontDescriptor"))
      : new Map<string, PdfValue>();
    const embedded = ["FontFile2", "FontFile3", "FontFile"]
      .map((key) => source.resolve(descriptor.get(key)))
      .find((value) => value instanceof PdfStream);
    let outline: OutlineFont | undefined;
    if (embedded instanceof PdfStream) {
      try {
        const program = source.stream(embedded);
        this.rawCff = program[0] === 1 && program[2]! >= 4;
        const decoded = create(Buffer.from(this.rawCff ? cffOpenType(program) : program));
        if ("fonts" in decoded)
          unsupported("A PDF font resource must reference one font, not a font collection.");
        outline = decoded;
      } catch (error) {
        if (error instanceof Error && error.name === "PdfError") throw error;
        unsupported(
          `Embedded /${this.kind} font ${this.baseName} needs an outline decoder for its font program.`,
        );
      }
    }
    this.outline = outline;
    this.unitsPerEm = outline?.unitsPerEm ?? 1000;
    const standard = standardName(this.baseName);
    this.standard = standard ? Font.load(standard) : undefined;
    this.css = {
      family: /Times/i.test(this.baseName)
        ? '"Times New Roman", "Liberation Serif", serif'
        : /Courier/i.test(this.baseName)
          ? '"Courier New", "Liberation Mono", monospace'
          : 'Arial, "Liberation Sans", sans-serif',
      weight: /bold/i.test(this.baseName) ? "bold" : "normal",
      style: /italic|oblique/i.test(this.baseName) ? "italic" : "normal",
    };
    this.defaultWidth = number(
      metrics.get(this.kind === "Type0" ? "DW" : "MissingWidth") ??
        descriptor.get("MissingWidth") ??
        (this.kind === "Type0" ? 1000 : 0),
    );
    const vertical = metrics.has("DW2")
      ? array(source.resolve(metrics.get("DW2"))).map((value) => number(value))
      : [880, -1000];
    this.defaultVertical = [vertical[0]!, vertical[1]!];
    if (this.kind === "Type0") {
      const widths = metrics.has("W") ? array(source.resolve(metrics.get("W"))) : [];
      for (let i = 0; i < widths.length;) {
        const first = integer(widths[i++]),
          next = source.resolve(widths[i++]);
        if (Array.isArray(next))
          next.forEach((value, index) => this.widths.set(first + index, number(value)));
        else {
          const last = integer(next),
            width = number(widths[i++]);
          if (last < first || last - first > 65535) invalid("Invalid CID width range.");
          for (let cid = first; cid <= last; cid++) this.widths.set(cid, width);
        }
      }
      const vertical = metrics.has("W2") ? array(source.resolve(metrics.get("W2"))) : [];
      for (let i = 0; i < vertical.length;) {
        const first = integer(vertical[i++]),
          next = source.resolve(vertical[i++]);
        if (Array.isArray(next)) {
          if (next.length % 3) invalid("Invalid vertical CID metrics.");
          for (let offset = 0; offset < next.length; offset += 3)
            this.verticalWidths.set(first + offset / 3, [
              number(next[offset]),
              number(next[offset + 1]),
              number(next[offset + 2]),
            ]);
        } else {
          const last = integer(next),
            metrics: readonly [number, number, number] = [
              number(vertical[i++]),
              number(vertical[i++]),
              number(vertical[i++]),
            ];
          if (last < first || last - first > 65535) invalid("Invalid vertical CID range.");
          for (let cid = first; cid <= last; cid++) this.verticalWidths.set(cid, metrics);
        }
      }
      const cidMap = source.resolve(metrics.get("CIDToGIDMap"));
      this.cidMap = cidMap instanceof PdfStream ? source.stream(cidMap) : undefined;
    } else {
      const encodingName =
        encoding instanceof Map
          ? name(encoding.get("BaseEncoding"), "StandardEncoding")
          : encoding instanceof PdfName
            ? encoding.value
            : this.baseName === "Symbol"
              ? "Symbol"
              : this.baseName === "ZapfDingbats"
                ? "ZapfDingbats"
                : "StandardEncoding";
      if (encodingName === "Symbol" || encodingName === "ZapfDingbats") {
        const selected = Encodings[encodingName];
        for (const point of selected.supportedCodePoints) {
          const encoded = selected.encodeUnicodeCodePoint(point);
          this.simple.set(encoded.code, {
            unicode: String.fromCodePoint(point),
            glyph: encoded.name,
          });
        }
      } else {
        for (const [code, value] of winAnsi) this.simple.set(code, value);
        if (encodingName === "MacRomanEncoding")
          for (let code = 0; code < 256; code++)
            this.simple.set(code, {
              unicode: new TextDecoder("macintosh").decode(Uint8Array.of(code)),
              glyph: "",
            });
        else if (encodingName === "StandardEncoding") {
          const extra: Record<number, string> = {
            39: "quoteright",
            96: "quoteleft",
            161: "exclamdown",
            162: "cent",
            163: "sterling",
            164: "fraction",
            165: "yen",
            166: "florin",
            167: "section",
            168: "currency",
            169: "quotesingle",
            170: "quotedblleft",
            171: "guillemotleft",
            172: "guilsinglleft",
            173: "guilsinglright",
            174: "fi",
            175: "fl",
            177: "endash",
            178: "dagger",
            179: "daggerdbl",
            180: "periodcentered",
            182: "paragraph",
            183: "bullet",
            184: "quotesinglbase",
            185: "quotedblbase",
            186: "quotedblright",
            187: "guillemotright",
            188: "ellipsis",
            189: "perthousand",
            191: "questiondown",
            193: "grave",
            194: "acute",
            195: "circumflex",
            196: "tilde",
            197: "macron",
            198: "breve",
            199: "dotaccent",
            200: "dieresis",
            202: "ring",
            203: "cedilla",
            205: "hungarumlaut",
            206: "ogonek",
            207: "caron",
            208: "emdash",
            225: "AE",
            227: "ordfeminine",
            232: "Lslash",
            233: "Oslash",
            234: "OE",
            235: "ordmasculine",
            241: "ae",
            245: "dotlessi",
            248: "lslash",
            249: "oslash",
            250: "oe",
            251: "germandbls",
          };
          for (let code = 127; code < 256; code++) this.simple.delete(code);
          for (const [code, glyph] of Object.entries(extra))
            this.simple.set(Number(code), { glyph, unicode: glyphText(glyph) });
        }
      }
      if (encoding instanceof Map && encoding.has("Differences")) {
        let code = 0;
        for (const value of array(source.resolve(encoding.get("Differences")))) {
          if (typeof value === "number") code = integer(value);
          else {
            const glyph = name(value);
            this.simple.set(code++, { glyph, unicode: glyphText(glyph) });
          }
        }
      }
      if (dictionary.has("Widths"))
        array(source.resolve(dictionary.get("Widths"))).forEach((width, i) =>
          this.widths.set(integer(dictionary.get("FirstChar")) + i, number(width)),
        );
    }
    if (!outline && !this.standard && this.kind !== "Type3")
      unsupported(`Unembedded font ${this.baseName} needs an explicit host fallback font.`);
  }
  private sourceDictionary(value: PdfValue | undefined) {
    return dictionary(this.source.resolve(value));
  }
  decode(bytes: Uint8Array): PdfGlyph[] {
    const codes = this.mapping.decode(bytes, this.kind === "Type0" ? 2 : 1);
    return codes.map((value) => this.glyph(value));
  }
  private glyph(value: PdfCode): PdfGlyph {
    const key = this.mapping.key(value),
      cid = this.mapping.cids.get(key) ?? value.code;
    const simple = this.simple.get(value.code);
    const unicode = this.unicode.unicode.get(key) ?? simple?.unicode ?? "\ufffd";
    let namedGlyph: number | undefined;
    if (this.rawCff && this.outline && this.kind !== "Type0") {
      if (!this.outlineNames) {
        this.outlineNames = new Map();
        for (let i = 0; i < this.outline.numGlyphs; i++) {
          const glyph = this.outline.getGlyph(i);
          if (glyph.name) this.outlineNames.set(glyph.name, i);
        }
      }
      namedGlyph = simple ? this.outlineNames.get(simple.glyph) : undefined;
    }
    let glyphId =
      this.kind === "Type0"
        ? this.cidMap
          ? (this.cidMap[cid * 2] ?? 0) * 256 + (this.cidMap[cid * 2 + 1] ?? 0)
          : cid
        : (namedGlyph ??
          (this.rawCff ? 0 : this.outline?.glyphForCodePoint(unicode.codePointAt(0) ?? 0).id) ??
          value.code);
    if (glyphId < 0 || (this.outline && glyphId >= this.outline.numGlyphs)) glyphId = 0;
    let path: string | undefined;
    if (this.outline) {
      path = this.paths.get(glyphId);
      if (path === undefined) {
        path = this.outline.getGlyph(glyphId).path.toSVG();
        this.paths.set(glyphId, path);
      }
    }
    const width =
      this.widths.get(this.kind === "Type0" ? cid : value.code) ??
      this.standard?.getWidthOfGlyph(simple?.glyph ?? "") ??
      this.defaultWidth;
    const procedures =
      this.kind === "Type3" ? this.sourceDictionary(this.dictionary.get("CharProcs")) : undefined;
    const procedure =
      procedures && simple ? this.source.resolve(procedures.get(simple.glyph)) : undefined;
    if (this.kind === "Type3" && !(procedure instanceof PdfStream))
      invalid("Type 3 glyph has no character procedure.");
    return {
      code: value.code,
      codeLength: value.length,
      cid,
      glyphId,
      unicode,
      width,
      path,
      procedure: procedure instanceof PdfStream ? procedure : undefined,
      vertical: this.vertical
        ? (this.verticalWidths.get(cid) ?? [
            this.defaultVertical[1],
            width / 2,
            this.defaultVertical[0],
          ])
        : undefined,
    };
  }
}
