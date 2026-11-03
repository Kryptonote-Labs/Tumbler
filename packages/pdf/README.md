# Tumbler PDF

`@tumblerjs/pdf` owns source-preserving PDF objects and page interpretation independently of
a host UI. Original bytes and revisions remain available for unchanged export and future edits.

```ts
import { openPdfDocument } from '@tumblerjs/pdf';
const document = openPdfDocument(bytes);
console.log(document.pages.map(page => ({ id: page.id, width: page.width, height: page.height })));
const unchanged = document.bytes();
```

The source reader follows ISO 32000-1 object syntax, classic and stream cross-references,
incremental revisions, compressed object streams, content filters and page-tree inheritance.
It does not replace malformed cross-reference data with a heuristic repair scan.
