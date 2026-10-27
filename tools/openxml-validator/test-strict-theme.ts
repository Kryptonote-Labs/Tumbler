import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { beginPackageTransaction } from '../../packages/opc/src/index.ts';
import { openWordArtifact } from '../../packages/word/src/index.ts';
import { reconcileWordContent } from '../../packages/word/src/content-export.ts';
import { buildWordDocumentFixture } from '../../packages/word/test/document-fixture.ts';

const [validator, directory] = process.argv.slice(2);
if (!validator || !directory) throw new Error('Pass built validator DLL and fixture output directory.');
const dotnet = process.env['DOTNET'] ?? 'dotnet';
await mkdir(directory, { recursive: true });

function fixture(profile: 'strict' | 'transitional', limit: string | undefined, invalidHighlight = false) {
  const namespace = profile === 'strict' ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const source = openWordArtifact(buildWordDocumentFixture({ conformance: profile,
    documentXml: `<w:document xmlns:w="${namespace}"><w:body><w:p/></w:body></w:document>` }));
  const authored = reconcileWordContent(source, [{ kind: 'paragraph', paragraph: { shading: { theme: 'accent1', fallback: '#156082' } }, runs: [{ text: 'Theme' }] }]);
  const pkg = authored.document.package;
  const theme = pkg.parts.find(part => part.contentType === 'application/vnd.openxmlformats-officedocument.theme+xml');
  assert.ok(theme);
  const transaction = beginPackageTransaction(pkg);
  const xml = new TextDecoder().decode(pkg.readPart(theme));
  assert.equal((xml.match(/<a:miter lim="[^"]*"/g) ?? []).length, 3);
  transaction.replacePart(theme.name, new TextEncoder().encode(xml.replace(/<a:miter lim="[^"]*"/g,
    () => limit === undefined ? '<a:miter' : `<a:miter lim="${limit}"`)));
  if (invalidHighlight) transaction.replacePart(authored.document.part.name, new TextEncoder().encode(
    authored.document.source.source.replace('<w:t', '<w:rPr><w:highlight w:val="invalid"/></w:rPr><w:t')));
  return transaction.commit();
}

const cases = [
  { name: 'strict-minimal', profile: 'strict', limit: '800%', error: undefined },
  { name: 'strict-fraction', profile: 'strict', limit: '12.345%', error: undefined },
  { name: 'strict-zero', profile: 'strict', limit: '0%', error: undefined },
  { name: 'strict-trailing-zeros', profile: 'strict', limit: '000800.0000%', error: undefined },
  { name: 'strict-int32-boundary', profile: 'strict', limit: '2147483.647%', error: undefined },
  { name: 'strict-optional', profile: 'strict', limit: undefined, error: undefined },
  ...['800000', '-1%', '+1%', ' 1%', '1% ', '1e2%', '1.%'].map((limit, index) =>
    ({ name: `strict-invalid-${index}`, profile: 'strict', limit, error: 'Invalid Strict a:miter/@lim' } as const)),
  ...['1.0001%', '2147483.648%'].map((limit, index) =>
    ({ name: `strict-unrepresentable-${index}`, profile: 'strict', limit, error: 'SDK cannot exactly represent' } as const)),
  { name: 'strict-unrelated-error', profile: 'strict', limit: '800%', invalidHighlight: true, error: 'highlight' },
  { name: 'transitional-original', profile: 'transitional', limit: '800000', error: undefined },
  { name: 'transitional-invalid', profile: 'transitional', limit: 'invalid', error: 'lim' },
] as const;

for (const item of cases) {
  const bytes = fixture(item.profile, item.limit, 'invalidHighlight' in item && item.invalidHighlight);
  const path = resolve(directory, `${item.name}.docx`);
  await Bun.write(path, bytes);
  const result: SpawnSyncReturns<string> = spawnSync(dotnet, [resolve(validator), path], { encoding: 'utf8', timeout: 30_000 });
  if (result.error) throw result.error;
  const log = result.stdout + result.stderr;
  await Bun.write(resolve(directory, `${item.name}.log`), log);
  assert.equal(result.status, item.error ? 1 : 0, log);
  if (item.error) assert.ok(log.includes(item.error), log);
  else if (item.profile === 'strict' && item.limit !== undefined) assert.ok(log.includes('translated 3 Strict theme miter limits'), log);
  assert.deepEqual(new Uint8Array(await readFile(path)), bytes, 'Validation changed the input package');
  console.log(`PASS ${item.name} sha256=${createHash('sha256').update(bytes).digest('hex')}`);
}
console.log(`${cases.length} Strict theme validator cases passed; original package bytes retained.`);
