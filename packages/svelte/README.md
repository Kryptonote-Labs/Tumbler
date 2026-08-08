# `@tumblerjs/svelte`

Replaceable Svelte 5 UI heads for Tumbler document models. Applications retain
complete ownership of their surrounding interface and styling.

> **Extremely early alpha.** Components and props can change without notice,
> and Office-format coverage remains incomplete.

```sh
bun add @tumblerjs/svelte@alpha @tumblerjs/sheets@alpha
```

```svelte
<script lang="ts">
  import { SpreadsheetFormulaBar, SpreadsheetGrid } from "@tumblerjs/svelte";
</script>

<SpreadsheetFormulaBar worksheet={artifact.worksheet} reference="A1" />
<SpreadsheetGrid worksheet={artifact.worksheet} calculation={artifact.calculation} />
```

Inline grid edits are always literals. The explicit formula bar treats input
beginning with `=` as a formula and emits a typed formula edit; applications own
applying the edit and replacing the artifact.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
