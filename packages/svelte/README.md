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
  import { SpreadsheetGrid } from "@tumblerjs/svelte";
</script>

<SpreadsheetGrid worksheet={artifact.worksheet} calculation={artifact.calculation} />
```

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
