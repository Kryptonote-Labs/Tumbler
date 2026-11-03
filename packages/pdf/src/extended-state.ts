import { PdfFont } from "./fonts.ts";
import type { PdfSource } from "./source.ts";
import type { State } from "./graphics-state.ts";
import {
  array,
  dictionary,
  integer,
  invalid,
  name,
  number,
  PdfName,
  type PdfDictionary,
  unsupported,
} from "./objects.ts";
const blendModes: Record<string, GlobalCompositeOperation> = {
  Normal: "source-over",
  Compatible: "source-over",
  Multiply: "multiply",
  Screen: "screen",
  Overlay: "overlay",
  Darken: "darken",
  Lighten: "lighten",
  ColorDodge: "color-dodge",
  ColorBurn: "color-burn",
  HardLight: "hard-light",
  SoftLight: "soft-light",
  Difference: "difference",
  Exclusion: "exclusion",
  Hue: "hue",
  Saturation: "saturation",
  Color: "color",
  Luminosity: "luminosity",
};

export function applyExtendedState(
  source: PdfSource,
  info: PdfDictionary,
  state: State,
  fonts: WeakMap<PdfDictionary, PdfFont>,
  resolveFont: (key: string) => PdfFont,
) {
  for (const [key, value] of info) {
    if (key === "LW") state.lineWidth = number(value);
    else if (key === "LC") {
      const cap = ["butt", "round", "square"][integer(value)];
      if (!cap) invalid("Invalid line cap.");
      state.lineCap = cap as CanvasLineCap;
    } else if (key === "LJ") {
      const join = ["miter", "round", "bevel"][integer(value)];
      if (!join) invalid("Invalid line join.");
      state.lineJoin = join as CanvasLineJoin;
    } else if (key === "ML") state.miterLimit = number(value);
    else if (key === "CA" || key === "ca") {
      const alpha = number(value);
      if (alpha < 0 || alpha > 1) invalid("Invalid PDF opacity.");
      if (key === "CA") state.strokeAlpha = alpha;
      else state.fillAlpha = alpha;
    } else if (key === "BM") {
      const modes = Array.isArray(value) ? value.map((value) => name(value)) : [name(value)];
      const mode = modes.map((mode) => blendModes[mode]).find(Boolean);
      if (!mode) unsupported("PDF blend mode has no supported canvas equivalent.");
      state.blend = mode;
    } else if (key === "SMask" && !(value instanceof PdfName && value.value === "None"))
      unsupported("PDF soft-mask graphics groups need an isolated compositing surface.");
    else if (key === "D") {
      const dash = array(source.resolve(value));
      state.dash = array(dash[0]).map((value) => number(value));
      state.dashPhase = number(dash[1]);
    } else if (key === "Font") {
      const font = array(source.resolve(value));
      const definition = source.resolve(font[0]);
      if (definition instanceof Map) {
        let cached = fonts.get(definition);
        if (!cached) {
          cached = new PdfFont(source, definition);
          fonts.set(definition, cached);
        }
        state.font = cached;
      } else state.font = resolveFont(name(definition));
      state.fontSize = number(font[1]);
    }
  }
}
