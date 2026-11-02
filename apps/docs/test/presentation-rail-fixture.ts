/// <reference types="bun" />
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'svelte/compiler';
// Isolate browser build conditions from the Bun test runner.
const root = resolve(import.meta.dir, '../../..');
const railPath = resolve(root, 'packages/svelte/src/PresentationSlideRail.svelte');
const built = await Bun.build({
  entrypoints: ['slide-drag-fixture'],
  target: 'browser',
  format: 'iife',
  conditions: ['browser'],
  plugins: [
    {
      name: 'slide-drag-fixture',
      setup(builder) {
        builder.onResolve({ filter: /^slide-drag-fixture$/ }, () => ({
          path: 'entry',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `import { mount, flushSync, unmount } from 'svelte';
            import Rail from '${railPath}';
            const host = document.createElement('div');
            host.style.cssText = 'position:absolute;left:100px;top:120px;width:160px;height:400px;overflow:hidden;transform:translateX(0)';
            document.body.append(host);
            window.moves = [];
            window.hints = 0;
            let app;
            flushSync(() => app = mount(Rail, {target:host, props:{
              presentation:{width:1280,height:720,slides:[
                {id:'first',title:'First slide'}, {id:'second',title:'Second slide'}
              ]},
              onreorder:(id,index) => window.moves.push({id,index}),
              reorderHint:(button) => {window.hints++;button.dataset.hostHint='true';return ()=>{window.hints--;delete button.dataset.hostHint;};}
            }}));
            window.destroy = () => unmount(app);`,
          loader: 'js',
        }));
        builder.onResolve({ filter: /^svelte(\/.*)?$/ }, ({ path }) => ({
          path:
            path === 'svelte'
              ? realpathSync(resolve(root, 'apps/docs/node_modules/svelte/src/index-client.js'))
              : Bun.resolveSync(path, resolve(root, 'apps/docs')),
        }));
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
          contents: compile(
            path.endsWith('/PresentationSlideView.svelte')
              ? '<script>let {slide} = $props();</script><div>{slide.title}</div>'
              : await Bun.file(path).text(),
            {
              filename: path,
              generate: 'client',
              css: 'injected',
            },
          ).js.code,
          loader: 'js',
        }));
      },
    },
  ],
});
if (!built.success) throw new Error(built.logs.map(String).join('\n'));

process.stdout.write(await built.outputs[0]!.text());
