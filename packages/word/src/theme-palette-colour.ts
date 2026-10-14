/** Office's palette uses single-precision HSL arithmetic and truncates RGB channels. */
export function wordPaletteColour(hex: string, step: number): string {
  const f = Math.fround;
  const [r, g, b] = [1, 3, 5].map((i) =>
    f(parseInt(hex.slice(i, i + 2), 16) / 255),
  ) as [number, number, number];
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const delta = f(high - low);
  const light = f(f(high + low) / 2);
  const saturation =
    delta === 0 ? 0 : f(delta / f(1 - Math.abs(f(f(2 * light) - 1))));
  const hue =
    delta === 0
      ? 0
      : f(
          60 *
            (high === r
              ? f(f(g - b) / delta)
              : high === g
                ? f(2 + f(f(b - r) / delta))
                : f(4 + f(f(r - g) / delta))),
        );
  const amount = f(step);
  const next = f(f(light * f(1 - Math.abs(amount))) + Math.max(amount, 0));
  const upper =
    next <= 0.5
      ? f(next * f(1 + saturation))
      : f(f(next + saturation) - f(next * saturation));
  const lower = f(f(2 * next) - upper);
  const range = f(upper - lower);
  const channel = (angle: number) => {
    const h = f(((angle % 360) + 360) % 360);
    const value =
      h < 60
        ? f(lower + f(f(range * h) / 60))
        : h < 180
          ? upper
          : h < 240
            ? f(lower + f(f(range * f(240 - h)) / 60))
            : lower;
    return Math.trunc(f(value * 255))
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + [f(hue + 120), hue, f(hue - 120)].map(channel).join("");
}
