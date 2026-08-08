# `@tumblerjs/charts`

Headless OOXML chart semantics and deterministic layout shared by Tumbler's
document formats and UI heads.

> **Extremely early alpha.** Chart coverage and visual fidelity are incomplete,
> and APIs can change without notice.

```sh
bun add @tumblerjs/charts@alpha
```

```ts
import { parseOoxmlChart } from "@tumblerjs/charts";

const chart = parseOoxmlChart(chartXml, "transitional");
```

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
