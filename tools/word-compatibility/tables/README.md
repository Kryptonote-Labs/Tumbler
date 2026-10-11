# Reading and preserving table structure

Four read targets use the pinned ECMA-376-1:2016 source:

- §17.4.17 `gridSpan`: omitted span means one; cells can augment the logical grid.
- §17.4.15 `gridBefore`: omitted means zero; offsets larger than the declared grid
  are ignored. A first cell with an explicit full-width span remains full-width.
- §17.4.14 `gridAfter`: omitted means zero; values conflicting with the remaining
  grid are ignored. Trailing declarations do not create extra columns.
- §17.4.84 `vMerge`: omitted element closes a group; omitted value means continue;
  restart opens a new group. Every continuation occupies the same grid columns.

`cases.ts` gives independently stated expected anchors, spans and text for
14 structural cases plus six integer-spelling cases. Each runs in Strict and Transitional markup. Every source cell
must belong to exactly one resolved anchor, and each continuation must belong to
the immediately following source row. The original row declarations remain
available even when the resolved grid must ignore them.

Six non-conformant merge arrangements are rejected: orphaned continuation,
changed span, shifted columns, and continuation after an unmerged cell or a row
that omits the merged columns at either edge. An invalid merge token is also
rejected. These negative packages are assertion inputs, not SDK-positive fixtures.
Grid counts accept leading zeroes, explicit plus signs and XML whitespace; malformed, negative, missing and zero-span values are rejected.
Mutation checks confirm the assertions reject altered spans and lost merges.

All valid input fixtures must pass Open XML SDK. Tests concern imported
`WordTable` data and `resolveWordTableGrid`, not pagination or column-width
algorithms. No read test earns rendering, authoring, editing or interoperability
credit. LibreOffice is not used as an oracle for these four read targets.

The suite exercises the documented structural rules, not every integer or every
possible combination of table features. The existing parser/resolver's 32,767
column guard remains an implementation constraint requiring separate work; this
PR neither adds that limit nor claims it is a Microsoft Word constraint. Native
editor import/export, nested-table interactions, tracked table changes and
legacy horizontal merging are outside these qualification criteria.

## Preservation

Four additional targets exercise every valid read fixture in both profiles through
neighbouring text replacement, undo/redo, run formatting and paragraph formatting.
The saved package must retain the entire table XML exactly, its expected grid,
anchor text, raw omission declarations and continuation ownership. No-op and undo
must reproduce the original package bytes. Entry names and all other part payloads
must remain unchanged. Both before and after packages require SDK validation.
These targets cover unrelated edits, not inserting/deleting table rows or columns.

## LibreOffice evidence and remaining gaps

A narrower interoperability requirement checks two independent vertical merges,
a restart and a closed group before and after neighbouring edits. Strict and
Transitional inputs require SDK validation and LibreOffice round-trips. No full
interoperability coverage plan is attached: the existing `interoperate.merged-tables`
requirement remains pending and earns no overall compatibility credit.

The broader probe failed its exact-grid assertion: LibreOffice rewrote the
`implicit-and-explicit-continuations` fixture from two grid columns to one.
All cells span both columns in that input. This may be equivalent normalisation;
it is not evidence of content loss, and the current oracle cannot qualify it.
The leading-omission case also remains unqualified. Do not infer that passing the
independent-column fixture proves either case.

The broader cases remain reproducible outside the qualifying registry:

```bash
bun -e 'import { runScenarios } from "./tools/word-compatibility/runner.ts"; import { tableInteropProbeScenarios } from "./tools/word-compatibility/tables/interoperability.ts"; console.log(await runScenarios(tableInteropProbeScenarios, { root: process.cwd(), output: "/tmp/table-interop-probe-fresh", libreoffice: true }));'
```

Use a fresh output directory and set `DOTNET` if .NET is not on PATH. The runner
returns evidence records; inspect their outcomes. The normal compatibility CLI
continues to fail on any failing registered check. It has no new failure exemptions.
