import { highlight } from '$lib/server/highlight';

export async function load() {
  const install = { language: 'Terminal', code: 'bun add @tumblerjs/svelte @tumblerjs/word @tumblerjs/sheets @tumblerjs/slides' };
  const example = { language: 'TypeScript', code: `import { openSpreadsheetArtifact } from '@tumblerjs/sheets';

const workbook = openSpreadsheetArtifact(bytes);
const edited = workbook.editCell('B2', 42);

const output = edited.bytes();` };
  return {
    install: { ...install, html: await highlight(install.code, install.language) },
    example: { ...example, html: await highlight(example.code, example.language) }
  };
}
