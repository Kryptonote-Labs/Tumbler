import { expect, test } from 'bun:test';
import { openZipArchive } from '../../../packages/opc/src/index.ts';
import { openWordArtifact } from '../../../packages/word/src/index.ts';
import { buildDeflatedZip } from '../../../packages/opc/test/zip-builder.ts';
import { preservationScenarios } from '../preservation/scenarios.ts';

for (const name of ['b', 'keepNext']) {
  test(`preservation checks reject dropped or altered ${name} markup`, () => {
    const scenario = preservationScenarios.find(item => item.id === `preserve-${name === 'b' ? 'run' : 'paragraph'}-${name.toLowerCase()}-strict`)!;
    const fixture = scenario.run().fixtures[0]!;
    const archive = openZipArchive(fixture.bytes);
    for (const replacement of ['', `<w:${name} w:val="false"/>`]) {
      const bytes = buildDeflatedZip(archive.entries.map(entry => ({ name: entry.name, data: entry.name === 'word/document.xml'
        ? new TextEncoder().encode(new TextDecoder().decode(archive.read(entry)).replace(`<w:${name}/>`, replacement))
        : archive.read(entry) })));
      expect(() => fixture.verify(openWordArtifact(bytes))).toThrow();
    }
  });
}
