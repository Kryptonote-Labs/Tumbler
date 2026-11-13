# React native Word editor

This example uses `NativeWordEditor` and the optional `@tumblerjs/word/browser`
adapter. React owns the editable DOM and toolbar; the native engine owns rich
edits, formatting, undo, layout and DOCX export. No Svelte or Yjs is needed.

The new APIs in this checkout are not yet published. From the repository root:

```sh
bun scripts/verify-word-consumer.ts --browser
```

This packs the local packages and installs this example outside the workspace,
then runs strict TypeScript checking without Yjs, a Vite production build,
and Chromium editing checks. Omit `--browser` to run only the typecheck and build.
It prints the consumer directory. Run `bun run dev` there to use the example.
After these APIs are released, set this example's Word dependency to that release
and use `bun install`, `bun run check`, and `bun run dev` here directly.

Select text to format it, or use Bold at a caret to set typing marks. Enter splits
a paragraph, Shift+Enter inserts a soft break, and paste inserts plain text.
Undo restores content and selection. Export and reopen checks the edited document
through DOCX without downloading it; Download DOCX saves it.

The example starts with imported highlighted text to exercise clearing source
formatting. The page itself is editable: Tumbler computes line wrapping and
pagination, and React positions editable text at those layout coordinates. There
is one document view, with the browser caret and selection inside the pages.
Wrapped lines and page continuations map back to stable native paragraph offsets.
It is not a full document UI for tables, drawings, or mixed-format toolbar state. The browser adapter uses browser DOM selection geometry and
expects the host to call `restoreSelection` after committing a render. The keyed
editable children replace provisional DOM when composition ends; ordinary
selection changes preserve the DOM so pointer selection can continue across pages.

The tsconfig supplies ES2024 library types and DOM typings while targeting ES2022.
It skips checking third-party declaration files; app and package TypeScript source
are checked. Vite handles the packages' TypeScript source imports.
