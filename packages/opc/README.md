# `@tumblerjs/opc`

Browser-first primitives for reading, validating, editing, and writing Open
Packaging Convention packages.

> **Extremely early alpha.** APIs and behavior can change without notice. Keep
> original copies of important documents.

```sh
bun add @tumblerjs/opc@alpha
```

```ts
import { openOpcPackage } from "@tumblerjs/opc";

const pkg = openOpcPackage(bytes);
console.log(pkg.mainOfficeDocumentPart());
```

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
