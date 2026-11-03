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
