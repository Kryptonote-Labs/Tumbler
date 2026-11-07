import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openPdfDocument, PdfInterpreter, mergePdfDocuments, parsePdfPageSelection } from '@tumblerjs/pdf';
import { pdfFixture, pdfStream } from '../../pdf/test/pdf-fixture.ts';
import { runTumbler } from '../src/index.ts';
import { createFileHost } from '../src/file-host.ts';

function fixture(prefix: string) {
  return pdfFixture([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 /MediaBox [0 0 240 320] /Resources << /Font << /F 6 0 R >> >> >>',
    ...[7, 8, 9].map(n => `<< /Type /Page /Parent 2 0 R /Contents ${n} 0 R >>`),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...[1, 2, 3].map(n => pdfStream(`BT /F 12 Tf 20 200 Td (${prefix}${n}) Tj ET`)),
  ]);
}
async function run(args: string[], host = createFileHost()) {
  let stdout = '', stderr = '';
  const code = await runTumbler(args, { host, stdout: s => { stdout += s; }, stderr: s => { stderr += s; } });
  return { code, stdout, stderr };
}
test('merge CLI matches shared API for interleaving, descending ranges, repetitions and all pages', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-merge-'));
  try {
    const a = join(dir, 'a.pdf'), b = join(dir, 'b.pdf'), output = join(dir, 'merged.pdf');
    const aBytes = fixture('A'), bBytes = fixture('B');
    writeFileSync(a, aBytes); writeFileSync(b, bBytes);
    const result = await run([a, 'pdf', 'merge', '--pages', '3,1,1', '--source', b, '--pages', '2-1', '--source', a, '--output', output]);
    expect(result.code).toBe(0); expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ output, format: 'pdf', pageCount: 8 });
    const merged = openPdfDocument(readFileSync(output));
    expect(merged.pages.map(p => new PdfInterpreter(merged).page(p.index).text)).toEqual(['A3','A1','A1','B2','B1','A1','A2','A3']);
    expect(readFileSync(output)).toEqual(Buffer.from(mergePdfDocuments([
      { document: openPdfDocument(aBytes), pages: parsePdfPageSelection('3,1,1', 3) },
      { document: openPdfDocument(bBytes), pages: parsePdfPageSelection('2-1', 3) },
      { document: openPdfDocument(aBytes) },
    ])));
    expect(readFileSync(a)).toEqual(Buffer.from(aBytes)); expect(readFileSync(b)).toEqual(Buffer.from(bBytes));
    expect(readdirSync(dir).sort()).toEqual(['a.pdf','b.pdf','merged.pdf']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('merge errors never replace sources or outputs and leave no temporary files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tumbler-merge-'));
  try {
    const a = join(dir, 'a.pdf'), output = join(dir, 'output.pdf');
    const bytes = fixture('A'); writeFileSync(a, bytes);
    for (const flags of [[], ['--output'], ['--unknown','x'], ['--pages','0','--output',output], ['--pages','4','--output',output], ['--pages','1,,2','--output',output], ['--pages','1','--pages','2','--output',output], ['--source','missing.pdf','--output',output], ['--output','bad.txt'], ['--output',a], ['--output',output,'--output',output]]) {
      const result = await run([a,'pdf','merge',...flags]);
      expect(result.code).toBe(1); expect(result.stderr).not.toBe('');
      expect(readFileSync(a)).toEqual(Buffer.from(bytes)); expect(readdirSync(dir)).toEqual(['a.pdf']);
    }
    writeFileSync(output, 'keep me');
    expect((await run([a,'pdf','merge','--output',output])).code).toBe(1);
    expect(readFileSync(output,'utf8')).toBe('keep me');
    rmSync(output); symlinkSync(a,output);
    expect((await run([a,'pdf','merge','--output',output])).code).toBe(1);
    expect(readFileSync(a)).toEqual(Buffer.from(bytes));
    expect(readdirSync(dir).sort()).toEqual(['a.pdf','output.pdf']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('merge help and host-backed parsing do not open sources or disclose passwords', async () => {
  expect((await run(['missing.pdf','pdf','merge','--help'])).stdout).toContain('--source');
  const calls: unknown[] = [];
  const host = { ...createFileHost(), mergePdf: async (input: unknown) => { calls.push(input); return { pageCount: 1 }; } };
  const result = await run(['first.pdf','pdf','merge','--password','secret','--source','next.pdf','--pages','1','--output','out.pdf'],host);
  expect(result).toEqual({code:0, stdout:'{"pageCount":1}\n', stderr:''});
  expect(calls).toEqual([{sources:[{path:'first.pdf',password:'secret'},{path:'next.pdf',pages:'1'}],output:'out.pdf'}]);
});
