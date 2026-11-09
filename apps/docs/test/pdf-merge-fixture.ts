/// <reference types="bun" />
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';

const root = resolve(import.meta.dir, '../../..');
const built = await Bun.build({
  entrypoints: ['merge-fixture'], target: 'browser', format: 'esm', conditions: ['browser'],
  plugins: [{ name: 'pdf-merge', setup(builder) {
    builder.onResolve({ filter: /^merge-fixture$/ }, () => ({ path: 'entry', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
      contents: `import {mount,unmount} from 'svelte';import PdfMerge from '${root}/packages/svelte/src/pdf/PdfMerge.svelte';const merge=mount(PdfMerge,{target:document.body,props:{submitLabel:"Merge and download PDF"}});
        window.pendingReads=[];
        window.startPendingRead=()=>merge.addSource('pending.pdf',signal=>new Promise(resolve=>window.pendingReads.push({signal,resolve})));
        window.finishPendingRead=(index,bytes)=>window.pendingReads[index].resolve(new Uint8Array(bytes));
        window.destroyMerge=()=>unmount(merge);`, loader: 'js',
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
const worker = await Bun.build({
  entrypoints: [resolve(root, 'packages/svelte/src/pdf/render.worker.ts')],
  target: 'browser', format: 'esm', conditions: ['browser'],
});
if (!worker.success) throw new Error(worker.logs.map(String).join('\n'));
process.stdout.write(JSON.stringify({ script: await built.outputs[0]!.text(), worker: await worker.outputs[0]!.text() }));
