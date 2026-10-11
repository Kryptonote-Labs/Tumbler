import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { renderCases, renderInput } from './cases.ts';
const directory = process.argv[2];
if (!directory) throw new Error('Supply an empty output directory');
await mkdir(directory, { recursive: true });
if ((await readdir(directory)).length) throw new Error('Output directory must be empty');
for (const profile of ['strict', 'transitional'] as const) for (const item of renderCases) {
  const input = renderInput(item, profile), name = `${item.id}-${profile}`;
  await Bun.write(join(directory, `${name}.docx`), input.bytes);
  await Bun.write(join(directory, `${name}.xml`), input.xml);
}
