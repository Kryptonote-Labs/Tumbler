# `@tumblerjs/opc`

Browser-first primitives for reading, validating, editing, and writing Open
Packaging Convention packages.

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
