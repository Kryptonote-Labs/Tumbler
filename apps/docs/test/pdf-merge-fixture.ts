/// <reference types="bun" />
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';

const root = resolve(import.meta.dir, '../../..');
const built = await Bun.build({
  entrypoints: ['merge-fixture'], target: 'browser', format: 'iife', conditions: ['browser'],
  plugins: [{ name: 'pdf-merge', setup(builder) {
    builder.onResolve({ filter: /^merge-fixture$/ }, () => ({ path: 'entry', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
      contents: `import {mount} from 'svelte';import PdfMerge from '${root}/packages/svelte/src/pdf/PdfMerge.svelte';mount(PdfMerge,{target:document.body});`, loader: 'js',
    }));
    builder.onResolve({ filter: /^svelte(\/.*)?$/ }, ({ path }) => ({ path: path === 'svelte'
      ? realpathSync(resolve(root, 'apps/docs/node_modules/svelte/src/index-client.js'))
      : Bun.resolveSync(path, resolve(root, 'apps/docs')) }));
    builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
      contents: compile(await Bun.file(path).text(), { filename: path, generate: 'client', css: 'injected' }).js.code,
      loader: 'js',
    }));
  } }],
});
if (!built.success) throw new Error(built.logs.map(String).join('\n'));
process.stdout.write(await built.outputs[0]!.text());
