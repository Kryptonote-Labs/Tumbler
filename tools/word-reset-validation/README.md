# Explicit reset validation

The reset suites cover source-aware export, inherited/default styles, partial
patches, replacement tabs, unknown XML, native body/stories, and scoped/linear
editing in migrated cells. They also exercise undo/redo and peer updates.

At main `768a9e2`, the unchanged `explicit-resets.test.ts` and
`explicit-reset-operations.test.ts` reproduce 15 failures and one passing no-op
case. Both files pass with the fix. The final repository suite has 2,035 passing
tests and zero failures; `bun run check` passes on Bun 1.4.4. The eight focused reset
suites pass 56 tests and 524 assertions after review fixes. The partial-edit suite
reproduces four failures on the first reviewed head `e3a2c72` and passes after
direct declarations are separated from inherited positioning.

## Schema checks

```sh
bun tools/word-reset-validation/fixtures.ts /tmp/reset-xml
python3 tools/word-reset-validation/schema.py /path/to/OfficeOpenXML-XMLSchema-Transitional.zip /tmp/reset-xml
```

All six fixtures pass the official ECMA Transitional schemas. The script needs
Python `lxml` and removes only these fixtures' known `mc:Ignorable="ext"` markup.
This validates those XML structures; it does not establish general Word
interoperability. Strict documents are covered by behavioral tests.

## Native update benchmark

`native-reset-results.json` records one matched pair comparing the previously
published PR head with the current implementation. Main cannot run this workload
correctly because it does not support the reset marker. Both measured revisions
verify inherited tabs/indents and record output counts and SHA-256 on every sample.
The JSON records exact revisions, runtime, hardware, protocol and raw samples.

```sh
bun tools/word-reset-validation/native-reset.bench.ts
```

Run the unchanged script in each revision with its dependencies installed, holding
`flock -x /tmp/tumbler-word-audit-heavy.lock` across both sequential invocations.
Timings are observations on a shared host, not a speedup claim. Memory deltas do
not measure total allocations.

`packages/word/test/explicit-resets.bench.ts` reproduces the original operation and
export workload and counts retained positioning during bulk partial edits.
