import { createCanvas } from '@napi-rs/canvas';
import schema from '../packages/charts/src/property-schema.json' with { type: 'json' };
const definition = Object.values(schema.types).find(type => type.name === 'a:prstClr')!;
const values = definition.attributes.find(attribute => attribute.name === 'val')!.choices!;
const context = createCanvas(1, 1).getContext('2d');
const colors: Record<string, string> = {};
for (const choice of values) {
  const css = choice.value.replace(/^lt(?=[A-Z])/, 'light').replace(/^dk(?=[A-Z])/, 'dark').replace(/^med(?=[A-Z])/, 'medium').toLowerCase();
  context.fillStyle = '#010203';
  context.fillStyle = css;
  if (context.fillStyle === '#010203') throw new Error(`Unknown DrawingML preset ${choice.value}`);
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  colors[choice.value] = [...pixel.slice(0, 3)].map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
}
await Bun.write(new URL('../packages/ooxml/src/preset-colors.ts', import.meta.url), '/** ECMA-376 DrawingML preset colour names use the corresponding SVG/CSS named colours. */\nexport const DRAWING_PRESET_COLORS: Readonly<Record<string, string>> = ' + JSON.stringify(colors, null, 2) + ';\n');
console.log(values.length);
