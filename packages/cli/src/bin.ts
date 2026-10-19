#!/usr/bin/env bun
import { runTumbler } from './index.ts';
import { createFileHost } from './file-host.ts';
process.exitCode = await runTumbler(process.argv.slice(2), {
  host: createFileHost(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
