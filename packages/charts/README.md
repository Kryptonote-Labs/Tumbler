# `@tumblerjs/charts`

Headless OOXML chart semantics and deterministic layout shared by Tumbler's
document formats and UI heads.

> **Extremely early alpha.** Chart coverage and visual fidelity are incomplete,
> and APIs can change without notice.

```sh
bun add @tumblerjs/charts
```

```ts
import { parseOoxmlChart } from "@tumblerjs/charts";

const chart = parseOoxmlChart(chartXml, "transitional");
```

The current read-only subset covers clustered bar/column, line, pie, doughnut,
numeric XY scatter, and two-dimensional bubble charts. Bubble series pair sparse
X, Y, and size caches by point index and support the standard area/width size
modes, 0–300% scaling, and opt-in negative values. Deterministic headless layout
is available through `layoutBubbleChart`.

Three-dimensional effects, per-point bubble formatting, data labels,
trendlines, error bars, and exact Office bubble-size normalization remain
explicitly unsupported. Unknown source XML is preserved by the owning OOXML
package even when a chart falls back rather than rendering.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
