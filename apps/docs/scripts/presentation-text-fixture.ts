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
            const texts = ${texts};
            for (const text of texts) for (const scale of [1, 0.2]) {
              const host = document.createElement('div');
              host.style.cssText = 'width:1104px;height:139px;position:relative;margin:200px;transform-origin:top left';
              host.style.transform = 'scale(' + scale + ')';
              host.dataset.scale = scale;
              document.body.append(host);
              flushSync(() => mount(Text, {target:host,props:{text}}));
            }`,
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
