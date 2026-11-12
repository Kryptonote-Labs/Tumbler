# `@tumblerjs/opc`

Browser-first primitives for reading, validating, editing, and writing Open
Packaging Convention packages.

This package exports TypeScript source. Use ES2024 library typings, including
`DOM` and `DOM.Iterable`, with a bundler that handles `.ts` imports. Your output
`target` can remain ES2022; `lib` adds typings, not runtime polyfills. See the
[consumer configuration and runtime API requirements](https://github.com/Kryptonote-Labs/Tumbler#typescript-and-runtime-requirements).

> **Extremely early alpha.** APIs and behavior can change without notice. Keep
> original copies of important documents.

```sh
bun add @tumblerjs/opc
```

```ts
import { openOpcPackage } from "@tumblerjs/opc";

const pkg = openOpcPackage(bytes);
console.log(pkg.mainOfficeDocumentPart());
```

Part reads retain up to 8 MiB of verified decompressed bytes per package, evicting
the least recently read parts first. `readPart` always returns a caller-owned
buffer. Set `maximumCachedPartBytes` in `openOpcPackage` options to adjust this
budget, or set it to zero to disable byte caching. Parsed relationships are also
reused for the lifetime of the package. Call `pkg.clearReadCache()` to release
both caches early. Saving edits creates a new package rather than mutating these
cached source parts.

Bun and Node select native, bounded raw-deflate codecs through package import
conditions. Browser bundles keep the JavaScript codec; native hosts avoid its
eager compression-table initialization. Both retain the archive size and CRC
checks.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).

`@tumblerjs/opc/compression` exposes the same `deflateRaw(bytes)` and bounded
`inflateRaw(bytes, expectedLength)` primitives for other engine archives. Package conditions
select native codecs on Bun/Node and fflate for browser bundles. Callers must check the
returned length against the declared length; returned bytes are independently owned.
