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

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
