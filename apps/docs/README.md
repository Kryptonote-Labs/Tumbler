# Tumbler docs and playground

SvelteKit documentation and a browser-only playground for the local Tumbler packages. The design uses Kryptonote's dark neutral surfaces, mint text, and restrained navigation. Switzer is loaded through Fontshare's hosted stylesheet.

From the repository root:

```sh
bun install
bun run dev
```

Or from this directory, `bun run dev`. The app's dev command is `vite --host 0.0.0.0`, making Vite's network URL accessible on the LAN. Add `--port 5174 --strictPort` to choose a port explicitly.

## Checks

```sh
bun run docs:check
bun run docs:build
bun run docs:test
```

Browser tests use Playwright Chromium. Install it with `bunx playwright install chromium` from this directory. On Raspberry Pi the configuration uses `/usr/bin/chromium` when available. Set `CHROMIUM_PATH` to override it. Tests start an isolated server on port 4175.

The browser tests cover desktop/mobile docs navigation, both edges of a Word page at different zoom levels, paragraph and drag selection, trackpad and touch zoom, edited Word exports, spreadsheet recalculation and export, and failed uploads preserving the current document.

## Samples and file handling

- `/playground/word-brief`: paragraphs, a table, and an embedded image.
- `/playground/word-pages?width=360`: mixed page widths in a narrow viewer.
- `/playground/sheet-budget`: editable cells, formula totals, and multiple sheets.

Samples are original MIT-licensed fixtures. Regenerate them with `bun run --cwd apps/docs samples`. The generator reuses the repository's fixture builders; they are not bundled into the site. Do not add private or customer files here.

Uploads remain in memory. There is no upload endpoint, document storage, or analytics. Refreshing the page loses edits. Download creates a local file from the current artifact. The playground accepts DOCX and XLSX files up to 20 MB; this limit supplements the parser's own archive limits.

## Vercel

- Root directory: `apps/docs`
- Framework: SvelteKit
- Include source files outside the root directory: enabled
- Install command: `cd ../.. && bun install --frozen-lockfile`
- Build command: `bun run build`
- Domain: `tumbler.alexco.dev`

The app uses the Vercel adapter and prerenders every docs and sample route. There are no runtime secrets. Workspace dependencies load Tumbler source directly, so preview deployments exercise that commit rather than the last published package. The UI shows the package version and source commit.
