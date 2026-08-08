# `@tumblerjs/formulas`

A headless parser and calculation engine for a deliberately small, growing
subset of spreadsheet formulas.

> **Extremely early alpha.** Formula coverage is incomplete and APIs can change
> without notice. Do not assume Excel-compatible calculation beyond documented
> and tested behavior.

```sh
bun add @tumblerjs/formulas@alpha
```

```ts
import { parseFormula } from "@tumblerjs/formulas";

const formula = parseFormula("SUM(B5:B7)");
```

The bounded evaluator currently supports arithmetic, comparisons, ordinary A1
references/ranges, core aggregates and logical functions, plus `COUNTIF`,
`SUMIF`, and `AVERAGEIF`. Conditional aggregates support comparison criteria,
case-insensitive text, `*`/`?` wildcards, `~` escaping, cross-sheet references,
and the standard top-left alignment behavior for result ranges.

`SUMIFS`, `COUNTIFS`, `AVERAGEIFS`, structured references, defined names, and
external-workbook references are not supported yet. Unsupported formulas retain
producer caches at the SpreadsheetML integration layer.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
