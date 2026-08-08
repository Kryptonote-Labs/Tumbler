# `@tumblerjs/sheets`

Headless SpreadsheetML reading, preservation, calculation, editing, and view
models for browser-based spreadsheet experiences.

> **Extremely early alpha.** Spreadsheet and formula coverage is incomplete,
> APIs can change without notice, and unsupported workbook content may not yet
> survive every edit. Keep original copies of important files.

```sh
bun add @tumblerjs/sheets@alpha
```

```ts
import { openSpreadsheetArtifact } from "@tumblerjs/sheets";

const artifact = openSpreadsheetArtifact(bytes);
console.log(artifact.workbook.sheets);
```

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
