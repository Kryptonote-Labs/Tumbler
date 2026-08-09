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

The bounded evaluator supports ordinary A1 references and ranges across sheets,
operators, core aggregates, conditional and multi-criteria aggregates, practical
math/statistics/text functions, deterministic dates, and scalar lookup families.
Visibility-aware `SUBTOTAL` and all 19 `AGGREGATE` reducers are included when
the workbook adapter can distinguish filtered rows from manually hidden rows.
The complete tested list and deliberate compatibility limits live in
[`docs/formula-calculation.md`](../../docs/formula-calculation.md).

```ts
import { calculateFormulas, type FormulaWorkbookSource } from "@tumblerjs/formulas";

const calculation = calculateFormulas(source satisfies FormulaWorkbookSource, {
  dateSystem: "1900",
  maxOperations: 1_000_000,
});

calculation.value({ sheet: "summary", row: 2, column: 3 });
calculation.diagnostics;
```

Unsupported formulas retain producer caches at the SpreadsheetML integration
layer. Structured references, defined names, external books, dynamic arrays,
volatile functions, and locale-sensitive `TEXT`/`VALUE` conversion are not
claimed yet.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
