import { colourSpace, deviceGray } from "./colour.ts";
import { decodePdfStream } from "./filters.ts";
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
import type { PdfImageData } from "./scene.ts";
import type { PdfSource } from "./source.ts";

/** Decode samples in PDF component order; encoded image codecs stay behind the painter's host boundary. */
export function decodePdfImage(
  source: PdfSource,
  info: PdfDictionary,
  encoded: Uint8Array,
  resources: PdfDictionary,
  depth = 0,
): PdfImageData {
  if (depth > 16) return invalid("Cyclic or excessively nested PDF image mask.");
  const width = integer(source.resolve(info.get("Width"))),
    height = integer(source.resolve(info.get("Height")));
  if (width < 1 || height < 1 || !Number.isSafeInteger(width * height * 4))
    return invalid("Invalid PDF image dimensions.");
  const stencil = info.get("ImageMask") === true,
    bits = integer(source.resolve(info.get("BitsPerComponent") ?? (stencil ? 1 : null)));
  if (![1, 2, 4, 8, 16].includes(bits)) return invalid("Invalid PDF image component depth.");
  const filter = source.resolve(info.get("Filter")),
    filters = filter instanceof PdfName ? [filter] : filter === null ? [] : array(filter);
  const names = filters.map((item) => name(item));
  const terminal = names[names.length - 1];
  if (terminal === "DCTDecode" || terminal === "DCT") {
    const prefix = new Map(info);
    prefix.set("Filter", filters.slice(0, -1));
    const parameters = source.resolve(info.get("DecodeParms"));
    if (Array.isArray(parameters)) prefix.set("DecodeParms", parameters.slice(0, -1));
    else prefix.delete("DecodeParms");
    return {
      width,
      height,
      rgba: undefined,
      encoded: decodePdfStream(encoded, prefix, (value) => source.resolve(value)),
      mime: "image/jpeg",
      interpolate: info.get("Interpolate") === true,
      stencil: false,
    };
  }
  const raw = decodePdfStream(encoded, info, (value) => source.resolve(value));
  const space = stencil ? deviceGray : colourSpace(source, info.get("ColorSpace"), resources);
  const rowLength = Math.ceil((width * space.components * bits) / 8),
    max = 2 ** bits - 1;
  if (raw.length < rowLength * height)
    return invalid("Decoded PDF image is shorter than its declared sample dimensions.");
  const decode = info.has("Decode")
    ? array(source.resolve(info.get("Decode"))).map((value) => number(value))
    : Array.from({ length: space.components }, () => [0, space.indexed ? max : 1]).flat();
  if (decode.length !== space.components * 2)
    return invalid("Image Decode array does not match component count.");
  const rgba = new Uint8ClampedArray(width * height * 4);
  const mask = source.resolve(info.get("Mask"));
  const colorKey = Array.isArray(mask) ? mask.map((item) => number(item)) : undefined;
  if (colorKey && colorKey.length !== space.components * 2)
    return invalid("Image colour-key mask has incorrect component count.");
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const samples: number[] = [],
        values: number[] = [];
      for (let channel = 0; channel < space.components; channel++) {
        let sample = 0;
        const start = y * rowLength * 8 + (x * space.components + channel) * bits;
        for (let bit = 0; bit < bits; bit++)
          sample = sample * 2 + ((raw[(start + bit) >> 3]! >> (7 - ((start + bit) & 7))) & 1);
        samples.push(sample);
        values.push(
          decode[channel * 2]! + (sample / max) * (decode[channel * 2 + 1]! - decode[channel * 2]!),
        );
      }
      const color = stencil ? [0, 0, 0] : space.rgb(values),
        at = (y * width + x) * 4;
      rgba[at] = color[0]!;
      rgba[at + 1] = color[1]!;
      rgba[at + 2] = color[2]!;
      rgba[at + 3] = stencil
        ? (1 - values[0]!) * 255
        : colorKey &&
            samples.every(
              (sample, i) => sample >= colorKey[i * 2]! && sample <= colorKey[i * 2 + 1]!,
            )
          ? 0
          : 255;
    }
  const softMask = source.resolve(info.get("SMask"));
  const maskStream =
    softMask instanceof PdfStream ? softMask : mask instanceof PdfStream ? mask : undefined;
  if (maskStream) {
    const maskImage = decodePdfImage(
      source,
      maskStream.dictionary,
      source.encodedStream(maskStream),
      resources,
      depth + 1,
    );
    if (!maskImage.rgba)
      return unsupported("Encoded image masks need host decoding before composition.");
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const mx = Math.min(maskImage.width - 1, Math.floor(((x + 0.5) * maskImage.width) / width)),
          my = Math.min(maskImage.height - 1, Math.floor(((y + 0.5) * maskImage.height) / height));
        const at = (y * width + x) * 4,
          maskAt = (my * maskImage.width + mx) * 4;
        rgba[at + 3] =
          (rgba[at + 3]! *
            (maskImage.stencil ? maskImage.rgba[maskAt + 3]! : maskImage.rgba[maskAt]!)) /
          255;
      }
  }
  return {
    width,
    height,
    rgba,
    encoded: undefined,
    mime: undefined,
    interpolate: info.get("Interpolate") === true,
    stencil,
  };
}

/** Canonical names for the abbreviated keys used only in inline image dictionaries. */
export function canonicalInlineDictionary(info: PdfDictionary): PdfDictionary {
  const keys: Record<string, string> = {
    W: "Width",
    H: "Height",
    BPC: "BitsPerComponent",
    CS: "ColorSpace",
    D: "Decode",
    DP: "DecodeParms",
    F: "Filter",
    IM: "ImageMask",
    I: "Interpolate",
  };
  return new Map([...info].map(([key, value]) => [keys[key] ?? key, value]));
}
