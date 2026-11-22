/** Generate numeric text metrics from the Computer Modern TFM files installed by TeX Live. */
import { join } from 'node:path';

const [directory] = Bun.argv.slice(2);
if (!directory)
  throw new Error('Usage: bun scripts/generate-latex-font-metrics.ts <cm-tfm-directory>');

async function font(name: string) {
  const file = await Bun.file(join(directory!, name + '.tfm')).arrayBuffer();
  const data = new DataView(file);
  const [, header, first, last, widthCount, heights, depths, italics, commands, kerns, extensions] =
    Array.from({ length: 11 }, (_, index) => data.getUint16(index * 2));
  const characters = 6 + header!;
  const widths = characters + last! - first! + 1;
  const programs = widths + widthCount! + heights! + depths! + italics!;
  const kerning = programs + commands!;
  const parameters = kerning + kerns! + extensions!;
  const fixed = (index: number) => data.getInt32(index * 4);
  const width = Array.from({ length: last! + 1 }, (_, code) =>
    code < first! ? 0 : fixed(widths + data.getUint8((characters + code - first!) * 4)),
  );
  const pairs: Record<number, readonly ['ligature' | 'kern', number]> = {};
  for (let code = first!; code <= last!; code++) {
    const info = (characters + code - first!) * 4;
    if ((data.getUint8(info + 2) & 3) !== 1) continue;
    let at = programs + data.getUint8(info + 3);
    if (data.getUint8(at * 4) > 128) at = programs + data.getUint16(at * 4 + 2);
    while (at < kerning) {
      const skip = data.getUint8(at * 4);
      const next = data.getUint8(at * 4 + 1);
      const op = data.getUint8(at * 4 + 2);
      const value = data.getUint8(at * 4 + 3);
      // Computer Modern uses simple replacement ligatures.
      if (op === 0) pairs[code * 256 + next] = ['ligature', value];
      else if (op >= 128)
        pairs[code * 256 + next] = ['kern', fixed(kerning + (op - 128) * 256 + value)];
      if (skip >= 128) break;
      at += skip + 1;
    }
  }
  return {
    widths: width,
    pairs,
    glue: [fixed(parameters + 1), fixed(parameters + 2), fixed(parameters + 3), fixed(parameters + 6)],
  };
}

const data = { cmr10: await font('cmr10'), cmr12: await font('cmr12') };
const source =
  '// Numeric widths and ligature/kern pairs from Knuth’s Computer Modern Roman TFM files.\n' +
  '// Regenerate with scripts/generate-latex-font-metrics.ts.\n' +
  'export const classicRoman = ' +
  JSON.stringify(data) +
  ' as const;\n';
await Bun.write(
  new URL('../packages/markdown/src/latex-roman-metrics.ts', import.meta.url),
  source,
);
