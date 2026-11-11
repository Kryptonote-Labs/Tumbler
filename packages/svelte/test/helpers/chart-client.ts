import { compile } from 'svelte/compiler';
import { Window } from 'happy-dom';
import type { Component, mount, unmount, flushSync, tick } from 'svelte';
import type { ChartModel, ChartContent } from '@tumblerjs/charts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Runtime {
  mount: typeof mount; unmount: typeof unmount; flushSync: typeof flushSync; tick: typeof tick;
  Harness: Component<{ initial: ChartModel; content?: ChartContent; workbench?: boolean }, { setModel(model: ChartModel): void; getContent(): ChartContent | undefined }>;
}
const globals = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'HTMLMediaElement', 'Text', 'Comment', 'Document', 'DocumentFragment', 'ShadowRoot', 'Event', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;

/** Bundle an isolated client runtime so DOM tests cannot share Svelte's cached window/prototypes. */
export async function chartClient() {
  const directory = await mkdtemp(join(tmpdir(), 'tumbler-chart-client-'));
  const packageDirectory = fileURLToPath(new URL('../../', import.meta.url));
  const svelteClient = join(dirname(Bun.resolveSync('svelte/package.json', packageDirectory)), 'src/index-client.js');
  const entry = join(directory, 'entry.ts');
  await Bun.write(entry, `export { mount, unmount, flushSync, tick } from ${JSON.stringify(svelteClient)}; export { default as Harness } from ${JSON.stringify(fileURLToPath(new URL('../fixtures/ChartPaintHarness.svelte', import.meta.url)))};`);
  const built = await Bun.build({
    entrypoints: [entry], outdir: join(directory, 'build'), target: 'browser', define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'chart-client-components', setup(build) {
      build.onResolve({ filter: /^svelte(?:\/|$)/ }, args => ({ path: args.path === 'svelte' ? svelteClient : Bun.resolveSync(args.path, packageDirectory) }));
      build.onResolve({ filter: /^@tumblerjs\// }, args => ({ path: Bun.resolveSync(args.path, packageDirectory), external: true }));
      build.onLoad({ filter: /\.svelte$/ }, async args => ({ contents: compile(await Bun.file(args.path).text(), { filename: args.path, generate: 'client', css: 'injected', dev: true }).js.code, loader: 'js' }));
    } }],
  });
  if (!built.success) { await rm(directory, { recursive: true, force: true }); throw new AggregateError(built.logs); }
  const output = built.outputs.find(output => output.kind === 'entry-point')!;
  const window = new Window({ url: 'http://localhost' });
  const previous = globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const name of globals) {
    const value: unknown = name === 'window' ? window : Reflect.get(window, name);
    Object.defineProperty(globalThis, name, { configurable: true, value: typeof value === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name) ? value.bind(window) : value });
  }
  Object.defineProperty(window.document, 'fonts', { value: new window.EventTarget() });
  async function dispose() {
    await window.happyDOM.abort();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
    await rm(directory, { recursive: true, force: true });
  }
  try { const runtime: Runtime = await import(output.path); return { ...runtime, dispose }; }
  catch (error) { await dispose(); throw error; }
}
