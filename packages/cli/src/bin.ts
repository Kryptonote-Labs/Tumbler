#!/usr/bin/env bun
import { runTumbler } from './index.ts';
import { createFileHost } from './file-host.ts';
const argv = process.argv.slice(2);
process.exitCode = await runTumbler(argv, {
  host: createFileHost(),
  readValue: async (path) => {
    const file = path === '-' ? Bun.stdin : Bun.file(path);
    if (argv[1] !== 'latex') return file.text();
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      await file.arrayBuffer(),
    );
  },
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
