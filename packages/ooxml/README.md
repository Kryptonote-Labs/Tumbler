# `@tumblerjs/ooxml`

Shared, loss-aware OOXML parsing, compatibility, theme, and document-property
primitives.

This package exports TypeScript source. Use ES2024 library typings, including
`DOM` and `DOM.Iterable`, with a bundler that handles `.ts` imports. Your output
`target` can remain ES2022; `lib` adds typings, not runtime polyfills. See the
[consumer configuration and runtime API requirements](https://github.com/Kryptonote-Labs/Tumbler#typescript-and-runtime-requirements).

> **Extremely early alpha.** APIs and behavior can change without notice. Keep
> original copies of important documents.

```sh
bun add @tumblerjs/ooxml
```

```ts
import { parseLosslessXml } from "@tumblerjs/ooxml";

const document = parseLosslessXml(xmlBytes);
console.log(document.root);
```

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
