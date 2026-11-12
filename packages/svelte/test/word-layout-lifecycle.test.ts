import { expect, test } from 'bun:test';
import { compile } from 'svelte/compiler';
import { Window } from 'happy-dom';
import { createCanvas } from '@napi-rs/canvas';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Component, mount, unmount, flushSync } from 'svelte';
import { createWordArtifact, type WordDocument } from '@tumblerjs/word';
import type { WordLayoutProgress, WordLayoutError } from '../src/word-layout-job.ts';

test('mount starts one job; replacement, fonts and destroy stop stale jobs', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const directory = await mkdtemp(join(root, 'node_modules', '.word-client-'));
  const svelteClient = join(dirname(Bun.resolveSync('svelte/package.json', root)), 'src/index-client.js');
  await Bun.write(join(directory, 'Harness.svelte'), `<script lang="ts">
    import View from ${JSON.stringify(fileURLToPath(new URL('../src/WordDocumentView.svelte', import.meta.url)))};
    let { initial, onprogress, onerror } = $props();
    let document = $state(initial);
    export function replace(next) { document = next; }
  </script><View wordDocument={document} onlayoutprogress={onprogress} onlayouterror={onerror} />`);
  const entry = join(directory, 'entry.ts');
  await Bun.write(entry, `export { mount, unmount, flushSync } from ${JSON.stringify(svelteClient)}; export { default as Harness } from './Harness.svelte';`);
  const built = await Bun.build({ entrypoints: [entry], outdir: join(directory, 'build'), target: 'browser', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{
    name: 'word-client', setup(build) {
      build.onResolve({ filter: /^svelte(?:\/|$)/ }, args => ({ path: args.path === 'svelte' ? svelteClient : Bun.resolveSync(args.path, root) }));
      build.onResolve({ filter: /^@tumblerjs\// }, args => ({ path: Bun.resolveSync(args.path, root), external: true }));
      build.onLoad({ filter: /\.svelte$/ }, async args => ({ contents: compile(await Bun.file(args.path).text(), { filename: args.path, generate: 'client', css: 'injected' }).js.code, loader: 'js' }));
    },
  }] });
  if (!built.success) { await rm(directory, { recursive: true, force: true }); throw new AggregateError(built.logs); }
  const window = new Window({ url: 'http://localhost' });
  const globals = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'HTMLMediaElement', 'Text', 'Comment', 'Document', 'DocumentFragment', 'ShadowRoot', 'Event', 'CustomEvent', 'MutationObserver', 'ResizeObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const previous = globals.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const name of globals) {
    const value: unknown = name === 'window' ? window : Reflect.get(window, name);
    Object.defineProperty(globalThis, name, { configurable: true, value: typeof value === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name) ? value.bind(window) : value });
  }
  const fonts = new window.EventTarget();
  Object.defineProperty(window.document, 'fonts', { value: fonts });
  let contexts = 0;
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', { value: () => { contexts++; return createCanvas(1, 1).getContext('2d'); } });
  const initial = createWordArtifact({ paragraphs: Array.from({ length: 300 }, () => ({ runs: [{ text: 'Long document '.repeat(60) }] })) }).document;
  const replacement = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Replacement' }] }] }).document;
  const updates: WordLayoutProgress[] = [];
  const errors: WordLayoutError[] = [];
  type Harness = Component<{ initial: WordDocument; onprogress: (progress: WordLayoutProgress) => void; onerror: (error: WordLayoutError) => void }, { replace(document: WordDocument): void }>;
  const runtime: { mount: typeof mount; unmount: typeof unmount; flushSync: typeof flushSync; Harness: Harness } = await import(built.outputs.find(output => output.kind === 'entry-point')!.path);
  const target = window.document.createElement('div');
  window.document.body.append(target);
  const app = runtime.mount(runtime.Harness, { target: target as unknown as HTMLElement, props: { initial, onprogress: progress => updates.push(progress), onerror: error => errors.push(error) } });
  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 200 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 5));
    expect(predicate()).toBe(true);
  };
  let unmounted = false;
  try {
    runtime.flushSync();
    expect(contexts).toBe(1);
    await waitFor(() => updates.length > 0);
    expect(updates[0]?.complete).toBe(false);
    runtime.flushSync(() => app.replace(replacement));
    const replacedAt = updates.length;
    await waitFor(() => updates.at(-1)?.complete === true);
    expect(updates.slice(replacedAt).every(update => update.document === replacement)).toBe(true);
    expect(contexts).toBe(2);
    runtime.flushSync(() => app.replace(initial));
    const beforeFont = contexts;
    fonts.dispatchEvent(new window.Event('loadingdone'));
    expect(contexts).toBe(beforeFont + 1);
    const destroyedAt = updates.length;
    await runtime.unmount(app);
    unmounted = true;
    fonts.dispatchEvent(new window.Event('loadingdone'));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(updates.length).toBe(destroyedAt);
    expect(contexts).toBe(beforeFont + 1);
    expect(errors).toEqual([]);
  } finally {
    if (!unmounted) await runtime.unmount(app);
    await window.happyDOM.close();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
    await rm(directory, { recursive: true, force: true });
  }
});
