# `@tumblerjs/core`

Format-neutral selection, geometry, command, transaction, and history
primitives for document editors.

> **Extremely early alpha.** APIs and behavior can change without notice.

```sh
bun add @tumblerjs/core
```

```ts
import { createGridSelection } from "@tumblerjs/core";

const selection = createGridSelection({ row: 1, column: 1 });
```

Shared formatting distinguishes set, inherit, mixed, and unavailable values so
replaceable heads can drive Sheets, Word, and Slides through one contract:

```ts
import type { FormattingPatch } from "@tumblerjs/core";

const patch: FormattingPatch = {
  text: {
    fontFamily: { set: "Aptos" },
    bold: { set: true },
    color: { set: { type: "rgb", value: "#C62828" } },
  },
  block: { horizontalAlignment: { set: "center" } },
};
```

Immutable editing history tracks the durable save point while keeping format
adapters and application UI independent:

```ts
import {
  commitEditingHistory,
  createEditingHistory,
  editingHistoryIsDirty,
  markEditingHistorySaved,
  undoEditingHistory,
} from "@tumblerjs/core";

let history = createEditingHistory(initialDocument, { limit: 100 });
history = commitEditingHistory(history, editedDocument);
history = undoEditingHistory(history);
history = markEditingHistorySaved(history);
console.log(editingHistoryIsDirty(history));
```

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
