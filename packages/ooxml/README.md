# `@tumblerjs/ooxml`

Shared, loss-aware OOXML parsing, compatibility, theme, and document-property
primitives.

> **Extremely early alpha.** APIs and behavior can change without notice. Keep
> original copies of important documents.

```sh
bun add @tumblerjs/ooxml@alpha
```

```ts
import { parseLosslessXml } from "@tumblerjs/ooxml";

const document = parseLosslessXml(xmlBytes);
console.log(document.root);
```

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
