/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { compile } from 'svelte/compiler';

// Real pointer sequences exercise the boundary between editing text and moving objects.
test('slide text and table cells edit on one click while manipulation stays available', async () => {
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
            <div style="width:1000px;height:650px">
              <View presentation={deck.document} slide={deck.document.slides[0]} {editable} toolbar={false}
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
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 750 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://fixture.local/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
    );
    await page.goto('https://fixture.local/');
    await page.addScriptTag({ content: await built.outputs[0]!.text() });
    const objects = page.locator('[data-slide-object]');
    await objects.first().waitFor();
    const title = objects.filter({ hasText: 'Click to add title' });
    await title.locator('.hit').click({ position: { x: 50, y: 40 } });
    const active = page.locator('[contenteditable="true"]');
    await active.waitFor();
    await page.keyboard.type('Single click title');
    expect(errors).toEqual([]);
    expect(await active.innerText()).toContain('Single click title');
    await page.keyboard.press('Escape');

    const shape = objects.filter({ hasText: 'Existing text' });
    await shape.locator('.hit').click({ position: { x: 80, y: 35 } });
    await active.waitFor();
    expect(await active.innerText()).toContain('Existing text');
    // Resizing remains available during text editing.
    const handles = shape.locator('.resize');
    expect(await handles.count()).toBe(8);
    const resizeBox = await handles.last().boundingBox();
    if (!resizeBox) throw new Error('Missing resize handle');
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox.x + 30, resizeBox.y + 20, { steps: 4 });
    await page.mouse.up();
    expect(await active.count()).toBe(0);
    expect(await page.evaluate('window.changes.length')).toBeGreaterThan(0);

    // A drag must not enter editing, even when the pointer returns to its origin.
    const hit = await shape.locator('.hit').boundingBox();
    if (!hit) throw new Error('Missing text box');
    await page.mouse.move(hit.x + 30, hit.y + 30);
    await page.mouse.down();
    await page.mouse.move(hit.x + 60, hit.y + 50, { steps: 3 });
    await page.mouse.move(hit.x + 30, hit.y + 30, { steps: 3 });
    await page.mouse.up();
    expect(await active.count()).toBe(0);
    await shape.locator('.hit').click({ modifiers: ['Shift'], position: { x: 40, y: 30 } });
    expect(await active.count()).toBe(0);

    const cells = page.locator('[data-table-cell]');
    await cells.first().locator('.cell-hit').click();
    await active.waitFor();
    await page.keyboard.type('First cell');
    expect(await cells.first().textContent()).toContain('First cell');
    await cells.nth(1).locator('.cell-hit').click();
    await active.waitFor();
    await page.keyboard.type('Second cell');
    expect(await cells.nth(1).textContent()).toContain('Second cell');

    await page.evaluate('window.readOnly()');
    await page.waitForFunction(() => !document.querySelector('[contenteditable="true"]'));
    await shape.click({ position: { x: 40, y: 30 } });
    expect(await active.count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
}, 30_000);
