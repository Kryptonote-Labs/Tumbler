// Uses the repository's Playwright/Chrome workflow. Run under the shared heavy-work lock.
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { chromium } from '../../apps/docs/node_modules/@playwright/test/index.mjs';
const root = process.env.WORD_LAYOUT_ROOT ?? process.cwd();
const directory = await mkdtemp(resolve(tmpdir(), 'word-line-chromium-'));
const entry = resolve(directory, 'entry.ts');
await Bun.write(entry, `
import { openOpcPackage } from ${JSON.stringify(resolve(root, 'packages/opc/src/index.ts'))};
import { openWordDocument, layoutWordDocument } from ${JSON.stringify(resolve(root, 'packages/word/src/index.ts'))};
import { buildWordDocumentFixture } from ${JSON.stringify(resolve(root, 'packages/word/test/document-fixture.ts'))};
export function run() {
  const document = openWordDocument(openOpcPackage(buildWordDocumentFixture({documentXml: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">' + ' '.repeat(150000) + '</w:t></w:r></w:p></w:body></w:document>'})));
  return [{maxPages:1,maxFragments:1},{maxPages:1,maxFragments:1,maxCharacters:1000,maxAtoms:1000,maxMeasurements:1001}].map(options => {
    let measurements=0;
    try { const layout=layoutWordDocument(document,{measure(text){measurements++;return {width:text.length*5,ascent:8,descent:2}}},options);return {measurements,fragments:layout.fragmentCount,endOffset:layout.pages[0].columns[0].lines[0].endOffset}; }
    catch(error){return {measurements,error:String(error)}}
  });
}
`);
try {
  const build = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'esm' });
  if (!build.success) throw new Error(build.logs.join('\n'));
  const url = `data:text/javascript;base64,${Buffer.from(await build.outputs[0]!.text()).toString('base64')}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async url => { const module = await import(url); return module.run(); }, url);
    console.log(JSON.stringify({ chromium: browser.version(), result }));
  } finally { await browser.close(); }
} finally { await rm(directory, { recursive: true, force: true }); }
