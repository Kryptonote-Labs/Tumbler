# `@tumblerjs/formulas`

A headless parser and calculation engine for a deliberately small, growing
subset of spreadsheet formulas.

This package exports TypeScript source. Use ES2024 library typings, including
`DOM` and `DOM.Iterable`, with a bundler that handles `.ts` imports. Your output
`target` can remain ES2022; `lib` adds typings, not runtime polyfills. See the
[consumer configuration and runtime API requirements](https://github.com/Kryptonote-Labs/Tumbler#typescript-and-runtime-requirements).

> **Extremely early alpha.** Formula coverage is incomplete and APIs can change
> without notice. Do not assume Excel-compatible calculation beyond documented
> and tested behavior.

```sh
bun add @tumblerjs/formulas
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
layer. The shared runtime supports rectangular arrays and spill overlays, names
resolved by the workbook source, and extensions through `functionRegistries`.
Category registration is assembled separately in `src/extended-functions.ts`.
See [shared runtime integration](../../docs/formula-runtime.md) for the API,
budgets, service boundaries, and remaining syntax limits.

`formulaFunctionCatalog` lists the built-in functions by name, category and
whether they need a host service, for function pickers and agent discovery.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
