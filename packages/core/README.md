# `@tumblerjs/core`

Format-neutral selection, geometry, command, transaction, and history
primitives for document editors.

> **Extremely early alpha.** APIs and behavior can change without notice.

```sh
bun add @tumblerjs/core@alpha
```

```ts
import { createGridSelection } from "@tumblerjs/core";

const selection = createGridSelection({ row: 1, column: 1 });
```

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
