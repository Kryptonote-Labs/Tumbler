/// <reference types="bun" />
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "svelte/compiler";

// Isolate Bun.build browser resolution from the test runner.
  const root = resolve(import.meta.dir, '../../..');
  const built = await Bun.build({
    entrypoints: ['click-edit-fixture'],
    target: 'browser',
    format: 'iife',
    conditions: ['browser'],
    plugins: [
      {
        name: 'click-edit-fixture',
        setup(builder) {
          builder.onResolve({ filter: /^click-edit-fixture$/ }, () => ({
            path: 'entry',
            namespace: 'fixture',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            contents: `import {mount} from 'svelte'; import Host from 'click-edit-host'; mount(Host,{target:document.body});`,
            loader: 'js',
          }));
          builder.onResolve({ filter: /^click-edit-host$/ }, () => ({
            path: 'host',
            namespace: 'host',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'host' }, () => ({
            contents: compile(
              `
            <script>
              import {tick} from 'svelte';
              let view;
              window.editMissing = () => view.editText('missing');
              window.editInserted = () => view.editText(deck.document.slides[0].objects.at(-1).key);
              async function insertTextBox() {
                change({name:'insert-object',slideId,bounds:{x:100,y:100,width:450,height:120},object:{kind:'shape',text:''}});
                await tick();
                window.editInserted();
              }
              import View from '${root}/packages/svelte/src/PresentationSlideView.svelte';
              import {createPresentation, applyPresentationCommand as apply} from '${root}/packages/slides/src/index.ts';
              let initial = createPresentation();
              const slideId = initial.document.slides[0].id;
              initial = apply(initial,{name:'layout',slideId,layout:'title-content'});
              initial = apply(initial,{name:'insert-object',slideId,bounds:{x:100,y:300,width:300,height:100},object:{kind:'shape',text:'Existing text'}});
              initial = apply(initial,{name:'insert-object',slideId,bounds:{x:500,y:300,width:300,height:100},object:{kind:'table',rows:1,columns:2}});
              let deck = $state.raw(initial);
              let editable = $state(true);
              window.readOnly = () => editable=false;
              window.changes = [];
              const change = command => deck=apply(deck,command);
            </script>
            <button onclick={insertTextBox}>Insert text box</button>
            <div style="width:1000px;height:650px">
              <View bind:this={view} presentation={deck.document} slide={deck.document.slides[0]} {editable} toolbar={false}
                onobjectschange={changes=>{window.changes.push(...changes);change({name:'batch',commands:changes.map(({slideId,objectKey,x,y,width,height,rotation})=>({name:'update-object',slideId,objectKey,x,y,width,height,rotation}))});}}
                ontextedit={edit=>change({name:'edit-text',...edit})}/>
            </div>`,
              { generate: 'client', css: 'injected' },
            ).js.code,
            loader: 'js',
          }));
          builder.onResolve({ filter: /^svelte(\/.*)?$/ }, ({ path }) => ({
            path:
              path === 'svelte'
                ? realpathSync(resolve(root, 'apps/docs/node_modules/svelte/src/index-client.js'))
                : Bun.resolveSync(path, resolve(root, 'apps/docs')),
          }));
          builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
            contents: compile(await Bun.file(path).text(), {
              filename: path,
              generate: 'client',
              css: 'injected',
            }).js.code,
            loader: 'js',
          }));
        },
      },
    ],
  });
  if (!built.success) throw new Error(built.logs.map(String).join('\n'));
  process.stdout.write(await built.outputs[0]!.text());
