#!/usr/bin/env bun
import { runTumbler } from "./index.ts";
import { createFileHost } from "./file-host.ts";
process.exitCode = await runTumbler(process.argv.slice(2), {
  host: createFileHost(),
  readValue: (path) => (path === "-" ? Bun.stdin.text() : Bun.file(path).text()),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
