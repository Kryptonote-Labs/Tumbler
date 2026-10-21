type Rgb = readonly [number, number, number];

function rgb(value: string): Rgb | undefined {
  const hex = value.replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex))
    return [parseInt(hex[0]! + hex[0]!, 16), parseInt(hex[1]! + hex[1]!, 16), parseInt(hex[2]! + hex[2]!, 16)];
  if (!/^[\da-f]{6}$/i.test(hex)) return undefined;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function hex(channels: Rgb) {
  return '#' + channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('');
}

function luminance(channels: Rgb) {
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

function contrast(a: Rgb, b: Rgb) {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Approximate Word's viewing palette. Microsoft does not publish its dark-mode mapping.
 * Reverse lightness between white and #262626, retaining hue and softening saturation.
 * This operates on resolved display colours, never document formatting or theme slots.
 */
function darkRgb(channels: Rgb): Rgb {
  const values = channels.map((value) => value / 255);
  const maximum = Math.max(...values), minimum = Math.min(...values);
  const lightness = (maximum + minimum) / 2;
  const nextLightness = 38 / 255 + (217 / 255) * (1 - lightness) ** 0.75;
  const range = maximum - minimum;
  if (range === 0) return [nextLightness * 255, nextLightness * 255, nextLightness * 255];
  const saturation = Math.min(0.8, range / (1 - Math.abs(2 * lightness - 1)));
  const chroma = (1 - Math.abs(2 * nextLightness - 1)) * saturation;
  const midpoint = nextLightness - chroma / 2;
  const channel = (value: number) => (midpoint + ((value / 255 - minimum) / range) * chroma) * 255;
  return [channel(channels[0]), channel(channels[1]), channel(channels[2])];
}

/** Keep readable foreground/background pairs readable after both colours change. */
function readable(foreground: Rgb, background: Rgb, minimum: number): Rgb {
  if (contrast(foreground, background) >= minimum) return foreground;
  const white: Rgb = [255, 255, 255], black: Rgb = [0, 0, 0];
  const target = contrast(white, background) > contrast(black, background) ? white : black;
  let low = 0, high = 1;
  const mix = (amount: number): Rgb => [
    foreground[0] + (target[0] - foreground[0]) * amount,
    foreground[1] + (target[1] - foreground[1]) * amount,
    foreground[2] + (target[2] - foreground[2]) * amount,
  ];
  for (let step = 0; step < 12; step++) {
    const middle = (low + high) / 2;
    if (contrast(mix(middle), background) >= minimum) high = middle;
    else low = middle;
  }
  return mix(high);
}

export function wordDarkColour(colour: string, background?: string): string {
  const source = rgb(colour);
  if (!source) return colour;
  const mapped = darkRgb(source);
  const surface = background && rgb(background);
  return hex(surface ? readable(mapped, darkRgb(surface), Math.min(4.5, contrast(source, surface))) : mapped);
}

/** CSS chooses the viewing colour without changing inline styles on theme switches.
 * Hosts must set color-scheme to light/dark on their page and force light when printing.
 * Pass the original surface colour for text, including cell/paragraph/run shading.
 */
export function wordDisplayColour(colour: string, background?: string): string {
  if (!rgb(colour)) return colour;
  return `light-dark(${colour},${wordDarkColour(colour, background)})`;
}
