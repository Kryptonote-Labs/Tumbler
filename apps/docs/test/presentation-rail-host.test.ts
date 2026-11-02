/// <reference types="bun" />
import { expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { compile } from 'svelte/compiler';

test('slide drag previews follow viewport coordinates outside transformed panes and clean up', async () => {
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
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ content: await built.outputs[0]!.text() });
    const first = page.locator('button[data-index="0"]');
    const second = page.locator('button[data-index="1"]');
    const preview = page.locator('.drag-preview');
    expect(await first.getAttribute('title')).toBeNull();
    expect(await first.getAttribute('data-host-hint')).toBe('true');
    expect(await page.evaluate<number>('window.hints')).toBe(2);
    const startDrag = async () => {
      await first.hover();
      await page.mouse.down();
      await page.mouse.move(300, 330);
      await preview.waitFor({ state: 'visible' });
    };
    const expectAtPointer = async (x: number, y: number) => {
      const bounds = await preview.boundingBox();
      expect(bounds).not.toBeNull();
      // The preview rotates by two degrees, slightly changing its bounding box.
      expect(Math.abs(bounds!.x - (x + 14))).toBeLessThan(5);
      expect(Math.abs(bounds!.y - (y + 12))).toBeLessThan(5);
      expect(await preview.evaluate((node) => node.parentElement === document.body)).toBe(true);
    };

    await startDrag();
    await expectAtPointer(300, 330);
    await page.mouse.move(400, 360);
    await expectAtPointer(400, 360);
    await page.mouse.up();
    await preview.waitFor({ state: 'detached' });
    expect(await page.evaluate<{ id: string; index: number }[]>('window.moves')).toEqual([]);

    await startDrag();
    const secondBounds = (await second.boundingBox())!;
    await page.mouse.move(
      secondBounds.x + secondBounds.width / 2,
      secondBounds.y + secondBounds.height - 4,
    );
    await page.mouse.up();
    await preview.waitFor({ state: 'detached' });
    expect(await page.evaluate<{ id: string; index: number }[]>('window.moves')).toEqual([
      { id: 'first', index: 1 },
    ]);

    await startDrag();
    await page.keyboard.press('Escape');
    await preview.waitFor({ state: 'detached' });
    await page.mouse.up();
    expect(await page.evaluate<{ id: string; index: number }[]>('window.moves')).toEqual([
      { id: 'first', index: 1 },
    ]);

    await startDrag();
    await page.evaluate('window.destroy()');
    await preview.waitFor({ state: 'detached' });
    await page.mouse.up();
    expect(await page.evaluate<number>('window.hints')).toBe(0);
  } finally {
    await browser.close();
  }
}, 30_000);
