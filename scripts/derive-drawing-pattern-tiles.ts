import { resolve } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { parseLosslessXml } from '../packages/ooxml/src/index.ts';
import { DRAWING_PATTERN_PRESETS } from '../packages/ooxml/src/pattern-presets.ts';

// Derive functional bit masks from the native PDF's SVG pattern images. Input SVGs are
// produced by pdftocairo -f N -l N -svg chart-pattern-reference.pdf microsoft-N.svg.
const directory = resolve(process.argv[2] ?? '/tmp/chart-pattern-reference');
const output = resolve(process.argv[3] ?? 'packages/ooxml/src/pattern-tiles.ts');
const tiles: Record<string, { size: number; rows: string[] }> = {};
for (let page = 0; page < 9; page++) {
  const source = parseLosslessXml(await Bun.file(resolve(directory, `microsoft-${page + 1}.svg`)).bytes());
  const images = source.elements().filter(element => element.localName === 'image');
  if (images.length !== 18) throw Error(`Expected three native fills per preset on page ${page + 1}.`);
  for (let index = 0; index < 6; index++) {
    const preset = DRAWING_PATTERN_PRESETS[page * 6 + index]!;
    const hrefs = images.slice(index * 3, index * 3 + 3).map(image => image.attributes.find(attribute => attribute.localName === 'href')!.value);
    if (new Set(hrefs).size !== 1) throw Error(`Shape and chart masks differ: ${preset}.`);
    const image = await loadImage(hrefs[0]!), canvas = createCanvas(image.width, image.height), context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    if (image.width !== 16 || image.height !== 16 || pixels.some((value, offset) => offset % 4 === 3 ? value !== 255 : value !== pixels[offset - offset % 4])) throw Error(`Expected an opaque greyscale 16x16 tile: ${preset}.`);
    let reducible = true;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (pixels[(y * 16 + x) * 4] !== pixels[(Math.floor(y / 2) * 2 * 16 + Math.floor(x / 2) * 2) * 4]) reducible = false;
    const step = reducible ? 2 : 1, rows: string[] = [];
    for (let y = 0; y < 16; y += step) {
      let row = '';
      for (let x = 0; x < 16; x += step) row += (255 - pixels[(y * 16 + x) * 4]!).toString(16).padStart(2, '0');
      rows.push(row);
    }
    tiles[preset] = { size: 8, rows };
  }
}
await Bun.write(output, `import type { DrawingPatternPreset } from './pattern-presets.ts';\n\n// Functional pattern masks measured from native Office output of the synthetic\n// chart-pattern-reference fixture. Regenerate with scripts/derive-drawing-pattern-tiles.ts.\nexport const DRAWING_PATTERN_TILES = {\n${Object.entries(tiles).map(([preset, tile]) => `  ${preset}: ${JSON.stringify(tile)},`).join('\n')}\n} as const satisfies Record<DrawingPatternPreset, { readonly size: number; readonly rows: readonly string[] }>;\n`);
console.log(Object.entries(tiles).map(([key, tile]) => `${key}: ${tile.rows.length}x${tile.rows.length}`).join('\n'));
