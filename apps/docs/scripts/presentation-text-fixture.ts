import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "svelte/compiler";

// Bun 1.3 build resolution can affect later imports in the same test process.
const root = resolve(import.meta.dir, "../../..");
const texts = await Bun.stdin.text();
const result = await Bun.build({
  entrypoints: ["presentation-fitting-fixture"],
  target: "browser",
  format: "iife",
  conditions: ["browser"],
  plugins: [
    {
      name: "presentation-fitting",
      setup(builder) {
        builder.onResolve({ filter: /^presentation-fitting-fixture$/ }, () => ({
          path: "entry",
          namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents: `import {mount, flushSync} from 'svelte';
            import Text from '${root}/packages/svelte/src/PresentationText.svelte';
            import {paintSlideText} from '${root}/packages/slides/src/canvas-text.ts';
            const texts = ${texts};
            for (const text of texts) for (const scale of [1, 0.2]) {
              const host = document.createElement('div');
              host.style.cssText = 'width:1104px;height:139px;position:relative;margin:200px;transform-origin:top left';
              host.style.transform = 'scale(' + scale + ')';
              host.dataset.scale = scale;
              document.body.append(host);
              flushSync(() => mount(Text, {target:host,props:{text}}));
            }

            for (const autoFit of ['normal', 'none']) for (const clipX of [false, true]) for (const clipY of [false, true]) {
              const canvas = document.createElement('canvas');
              canvas.width = 320; canvas.height = 200;
              canvas.className = 'canvas-overflow';
              canvas.dataset.clipX = String(clipX); canvas.dataset.clipY = String(clipY);
              const ctx = canvas.getContext('2d'); ctx.translate(40, 40);
              const paragraph = texts[0].paragraphs[0];
              const text = {...texts[0], autoFit, anchor:'top', wrap:false, inset:[0,0,0,0],
                horizontalOverflow: clipX ? 'clip' : 'overflow', verticalOverflow: clipY ? 'clip' : 'overflow',
                paragraphs:[{...paragraph, align:'left', fontSize:64, lineHeight:1, before:0, after:0, marginLeft:0, indent:0,
                  runs:[{...paragraph.runs[0], text:'MMMMMMMM', fontFamily:'Arial', fontSize:64, color:'#000000'}]}]};
              paintSlideText(ctx, text, 50, 20, {path:d=>new Path2D(d)});
              document.body.append(canvas);
            }
            `,
          loader: "js",
        }));
        builder.onResolve({ filter: /^svelte(\/.*)?$/ }, ({ path }) => ({
          path:
            path === "svelte"
              ? realpathSync(resolve(root, "apps/docs/node_modules/svelte/src/index-client.js"))
              : Bun.resolveSync(path, resolve(root, "apps/docs")),
        }));
        builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
          contents: compile(await Bun.file(path).text(), {
            filename: path,
            generate: "client",
            css: "injected",
          }).js.code,
          loader: "js",
        }));
      },
    },
  ],
});
if (!result.success) throw new Error(result.logs.map(String).join("\n"));

process.stdout.write(await result.outputs[0]!.text());
