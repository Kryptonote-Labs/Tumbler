# Packed Word entry comparison

Copy this directory outside the workspace, create its `packs` directory, and run
`bun pm pack --cwd packages/svelte --destination <consumer>/packs` from the
repository root. In the copied consumer, run `bun install`, then
`bun run node_modules/vite/bin/vite.js build`. Change the named import in
`App.svelte` to `@tumblerjs/svelte` and rebuild to compare the root entry.

The fixture pins alpha.27 for reproducibility. Update the tarball filename and
published dependency version together to compare a later release.

Measured with Vite 7.3.8 and Svelte 5.57.3, minified decimal kB:

| Entry | Main JS | Lazy rtf.js |
| --- | ---: | ---: |
| Root | 1,215.24 | 2,237.75 |
| Word | 1,059.93 | 2,237.75 |

Both builds use the same packed Svelte package and published alpha.27 dependencies.
The consumer retains both the viewer and artifact loader through `globalThis.openDoc`.
This checks package export resolution and bundling, not browser rendering.
rtf.js remains lazy and supports EMF/WMF picture fills through
WordInkPageLayer and presentation-metafiles. Word charts still import their
renderer. No global `sideEffects: false` flag or optional dependency changes are
made, since those require a broader audit of runtime initialization and resolution.
