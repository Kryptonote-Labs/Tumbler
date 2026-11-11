import { z } from "zod";
const color = z.string().regex(/^#[a-f\d]{6}$/i);
const ratio = z.number().finite().min(0).max(1);
export const gradientFill = z
  .object({
    kind: z.literal("gradient"),
    type: z.enum(["linear", "radial", "rectangular"]),
    angle: z.number().finite().optional(),
    scaled: z.boolean().optional(),
    center: z.tuple([ratio, ratio]).optional(),
    stops: z.array(z.object({ offset: ratio, color, opacity: ratio.optional() }).strict()).min(2),
  })
  .strict();
export type GradientFill = z.infer<typeof gradientFill>;

const percent = (n: number) => Math.round(n * 100000);
const colour = (value: string, opacity = 1) =>
  `<a:srgbClr val="${value.slice(1)}"><a:alpha val="${percent(opacity)}"/></a:srgbClr>`;

/** Native DrawingML gradient shared by slide backgrounds and shape fills. */
export function gradientFillMarkup(input: GradientFill) {
  const fill = gradientFill.parse(input);
  const stops = [...fill.stops]
    .sort((a, b) => a.offset - b.offset)
    .map((s) => `<a:gs pos="${percent(s.offset)}">${colour(s.color, s.opacity)}</a:gs>`)
    .join("");
  const [x, y] = fill.center ?? [0.5, 0.5];
  const shade =
    fill.type === "linear"
      ? `<a:lin ang="${Math.round(((((fill.angle ?? 0) % 360) + 360) % 360) * 60000) % 21600000}" scaled="${fill.scaled === false ? 0 : 1}"/>`
      : `<a:path path="${fill.type === "radial" ? "circle" : "rect"}"><a:fillToRect l="${percent(x)}" t="${percent(y)}" r="${percent(1 - x)}" b="${percent(1 - y)}"/></a:path>`;
  return `<a:gradFill><a:gsLst>${stops}</a:gsLst>${shade}</a:gradFill>`;
}

/** `rectangular` covers DrawingML `rect` and `shape` paths, which match on rectangular fills. */
export interface DrawingGradient {
  readonly focusRect?: readonly [number, number, number, number];
  readonly kind: "linear" | "radial" | "rectangular";
  readonly angle: number;
  readonly scaled: boolean;
  readonly center: readonly [number, number];
  readonly stops: readonly {
    readonly offset: number;
    readonly color: string;
  }[];
}

/** Shared SVG/canvas endpoints, including DrawingML's aspect-scaled linear shading. */
export function linearGradientLine(value: DrawingGradient, width: number, height: number) {
  const angle = (value.angle * Math.PI) / 180;
  const gx = Math.cos(angle) / (value.scaled ? width || 1 : 1),
    gy = Math.sin(angle) / (value.scaled ? height || 1 : 1);
  const length = (Math.abs(width * gx) + Math.abs(height * gy)) / (gx * gx + gy * gy || 1);
  return [
    width / 2 - (gx * length) / 2,
    height / 2 - (gy * length) / 2,
    width / 2 + (gx * length) / 2,
    height / 2 + (gy * length) / 2,
  ] as const;
}
/**
 * DrawingML `rect` path shading in unit space: four faces meet at the focus and each shades from
 * the focus (offset 0) to its own edge, so contours are rectangles. `bleed` grows each face so
 * anti-aliased renderers show no seams; only use it with opaque stops, since overlaps composite
 * translucent colour twice. Hosts clip to the filled area.
 */
export function rectangularGradientFaces([cx, cy]: readonly [number, number], bleed = 0, focusRect?: readonly [number, number, number, number]) {
  const [l, t, r, b] = focusRect ?? [cx, cy, cx, cy];
  const faces = [
    { points: [[0, 0], [1, 0], [r, t], [l, t]], line: [cx, t, cx, 0] },
    { points: [[1, 0], [1, 1], [r, b], [r, t]], line: [r, cy, 1, cy] },
    { points: [[1, 1], [0, 1], [l, b], [r, b]], line: [cx, b, cx, 1] },
    { points: [[0, 1], [0, 0], [l, t], [l, b]], line: [l, cy, 0, cy] },
  ] as const;
  return faces
    .filter(({ line: [x1, y1, x2, y2] }) => x1 !== x2 || y1 !== y2)
    .map(({ points, line }) => {
      const region: readonly (readonly [number, number])[] = points;
      const mx = region.reduce((sum, point) => sum + point[0], 0) / region.length,
        my = region.reduce((sum, point) => sum + point[1], 0) / region.length;
      return {
        points: region.map(([x, y]) => {
          const d = Math.hypot(x - mx, y - my) || 1;
          return [x + ((x - mx) / d) * bleed, y + ((y - my) / d) * bleed] as const;
        }),
        line,
      };
    });
}

export function drawingGradientFill(fill: GradientFill): DrawingGradient {
  return { kind: fill.type, angle: fill.angle ?? 0, scaled: fill.scaled ?? true, center: fill.center ?? [0.5, 0.5], stops: [...fill.stops].sort((a,b) => a.offset-b.offset).map(s => ({ offset: s.offset, color: `rgba(${[1,3,5].map(i => parseInt(s.color.slice(i,i+2),16)).join(',')},${s.opacity ?? 1})` })) };
}

/** Read the RGB gradients this editor can author. Unsupported transforms stay in source XML. */
export function readGradientFill(element: import('./xml/source-document.ts').LosslessXmlElement): GradientFill | undefined {
  type Element = import('./xml/source-document.ts').LosslessXmlElement;
  const children = (e: Element) => e.children.filter((n): n is Element => n.kind === 'element');
  const attr = (e: Element | undefined, name: string) => e?.attributes.find(a => a.localName === name)?.value;
  const nodes = children(element);
  const list = nodes.find(n => n.localName === 'gsLst');
  const linear = nodes.find(n => n.localName === 'lin');
  const path = nodes.find(n => n.localName === 'path');
  if (element.attributes.filter(a => a.namespaceUri !== 'http://www.w3.org/2000/xmlns/').some(a => !['flip', 'rotWithShape'].includes(a.localName) || a.localName === 'flip' && a.value !== 'none' || a.localName === 'rotWithShape' && a.value !== '1')) return;
  if (nodes.some(n => n.localName === 'tileRect' && n.attributes.some(a => Number(a.value) !== 0))) return;
  if (!list || !!linear === !!path || nodes.some(n => !['gsLst','lin','path','tileRect'].includes(n.localName))) return;
  const stops = children(list).map(s => {
    const rgb = children(s)[0];
    if (s.localName !== 'gs' || children(s).length !== 1 || !rgb || rgb.localName !== 'srgbClr' || children(rgb).some(n => n.localName !== 'alpha')) return;
    const alpha = children(rgb).find(n => n.localName === 'alpha');
    return { offset: Number(attr(s,'pos')) / 100000, color: '#' + attr(rgb,'val'), ...(alpha ? { opacity: Number(attr(alpha,'val')) / 100000 } : {}) };
  });
  const rect = path && children(path).find(n => n.localName === 'fillToRect');
  if (path && !['circle','rect'].includes(attr(path,'path') ?? '')) return;
  if (path && (!rect || Number(attr(rect,'l')) + Number(attr(rect,'r')) !== 100000 || Number(attr(rect,'t')) + Number(attr(rect,'b')) !== 100000)) return;
  const value = { kind: 'gradient', type: linear ? 'linear' : attr(path,'path') === 'circle' ? 'radial' : 'rectangular', ...(linear ? { angle: Number(attr(linear,'ang') ?? 0) / 60000, scaled: ['1', 'true'].includes(attr(linear,'scaled') ?? '0') } : { center: [Number(attr(rect,'l') ?? 50000) / 100000, Number(attr(rect,'t') ?? 50000) / 100000] }), stops };
  const result = gradientFill.safeParse(value);
  return result.success ? result.data : undefined;
}
