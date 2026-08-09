# `@tumblerjs/svelte`

Replaceable Svelte 5 UI heads for Tumbler document models. Applications retain
complete ownership of their surrounding interface and styling.

> **Extremely early alpha.** Components and props can change without notice,
> and Office-format coverage remains incomplete.

```sh
bun add @tumblerjs/svelte@alpha @tumblerjs/sheets@alpha @tumblerjs/core@alpha
```

```svelte
<script lang="ts">
  import { createGridSelection } from "@tumblerjs/core";
  import { FormattingToolbar, SpreadsheetFormulaBar, SpreadsheetGrid } from "@tumblerjs/svelte";

  let selection = $state(createGridSelection({ row: 1, column: 1 }));
</script>

<SpreadsheetFormulaBar worksheet={artifact.worksheet} reference="A1" />
<FormattingToolbar
  state={artifact.formattingState(selection.range)}
  capabilities={artifact.formattingCapabilities(selection.range)}
  onformat={(patch) => artifact = artifact.applyFormatting(selection.range, patch)}
/>
<SpreadsheetGrid
  worksheet={artifact.worksheet}
  calculation={artifact.calculation}
  {selection}
  onselectionchange={(next) => selection = next}
/>
```

`FormattingToolbar` is format-neutral. Future Word and Slides heads can supply
the same state and capability contract without replacing application UI. Its
font-family field writes arbitrary Office font names rather than limiting files
to a browser-dependent preset list.

The grid automatically projects supported conditional font, fill, and border
rules from the worksheet. Its source rules and package bytes remain unchanged.

Inline grid edits are always literals. The explicit formula bar treats input
beginning with `=` as a formula and emits a typed formula edit; applications own
applying the edit and replacing the artifact.

Unwrapped left-aligned text paints across consecutive empty cells, matching the
worksheet convention without widening those cells' interactive hit areas.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
