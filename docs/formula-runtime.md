# Shared formula runtime

The category integration branch assembles `packages/formulas/src/extended-functions.ts`.
The foundation has an empty `extendedFunctions` registry; category PRs add their
registrations. The uncached-XLSX corpus harness discovers their fixture modules.

`calculateFormulas(source, options)` accepts `functionRegistries?: readonly
FunctionRegistry[]`. Later registries take precedence, followed by the default
extended registry, then existing builtins. Function names are uppercase with
OOXML `_xlfn.` / `_xlws.` prefixes removed. Stored `_xlpm.` names resolve in
their captured lexical scope. A handler receives raw AST arguments.
`context.call(name, values)` dispatches already evaluated scalars, arrays,
lambdas, and omitted arguments without converting them to formula text.

`FunctionValue` includes `{kind: 'omitted'}`; it remains distinguishable inside
lambda calls and is treated as blank by the scalar/matrix helpers. Names use
`{kind: 'name', name}` AST nodes, omitted arguments `{kind: 'omitted'}`.
Internal `value` AST nodes carry pre-evaluated values for dispatch. The parser
also represents arrays, invocation, `@` intersection, and postfix `#` spills.
`withBindings` captures a snapshot of lexical values and the formula address.
Nested cell evaluation resets cell-local bindings and restores the caller's
address and scope afterward. Named lambdas can be supplied by `resolveName`.

Arrays are rectangular scalar matrices. `calculation.arrayValue(address)`
returns the complete successful array at an anchor; `calculation.value(address)`
returns calculated scalar overlays at both anchors and spill destinations.
Snapshots never write these into source cells or caches. Obstruction returns
`#SPILL!` with no partial overlay. Sheets reject occupied cells, merged cells,
and table cells; custom sources can implement `spillBlocked(address)`.
Earlier consumers of newly discovered spills and their transitive dependants
are recalculated. Dependencies include dynamically read references and spill
producer anchors. Source edits and reopen create a fresh calculation snapshot.
The Svelte grid already renders every visible cell through snapshot display;
text overflow now also reserves virtual spill destinations.

Arithmetic broadcasts singleton rows/columns, carries element errors, and
rejects incompatible shapes. Existing aggregate coercion/visibility behavior is
retained. Core scalar math/text/date functions lift over arrays; category
handlers control their own lifting. Core INDEX can select whole rows/columns,
XLOOKUP can return matrix rows/columns, and SUMPRODUCT consumes array arithmetic.
WEEKDAY supports return types 11–17. TRUE()/FALSE() parse as calls. Function
identifiers containing digits are tokenized whole (for example BIN2DEC).

## Source metadata and references

Optional `FormulaWorkbookSource` hooks:

- `sheetNames(): readonly string[]`: visible sheet names in workbook order.
- `sheetIndex(sheet): number | undefined`: source sheet identity to one-based index.
- `usedDimensions(sheet): {rows, columns}`: used extent for bounded dependency and blank-insensitive aggregate scans.
- `resolveName(name, address): FormulaExpression | FunctionReference | undefined`.
- `spillBlocked(address): boolean`.

`FormulaCellInput` optionally supplies `numberFormatId` and `numberFormatCode`.
The sheets adapter populates these and the metadata hooks. It resolves global
and local defined names and common explicit table references (`Table[Column]`,
column spans, #Data/#Headers/#Totals/#All/#This Row and @ column selectors).
Noncontiguous column selections are unresolved rather than approximated as a
contiguous range. Workbook calculations enumerate sheets to discover spills
referenced from other sheets, including sheets later in workbook order.

`context.reference` resolves ordinary geometry plus nested reference-valued
OFFSET, A1-style INDIRECT, INDEX, names, and spill references. `readReference`
validates bounds, enforces array limits, evaluates dependencies, and records
reads. Whole-column and whole-row references, including absolute axes, use
full worksheet reference geometry. Blank-insensitive aggregates can bound scans by
source used dimensions; materializing the full reference is subject
to the explicit calculation budget. Arrays are never silently truncated to fit.

## Budgets, time, and services

`maxArrayCells` defaults to `maxRangeCells`, then 100,000. Formula count, range
size, evaluation depth, and operation limits remain enforced. Budget failures
emit diagnostics and preserve producer caches; they are not successful output.
Handlers must charge their own work using `context.operation(count)` and honor
`context.maxArrayCells`. Recursive evaluation also has a runtime frame bound.

`now?: () => Date` is sampled once per calculation. `context.now()` returns a
fresh Date copy of that instant. The sheets visibility passes share the same
captured instant. `random?: () => number` supplies a generator: each draw advances
it; it is not frozen to one sample. Defaults are Date and Math.random.
`services?: FormulaFunctionServices` is the sole explicit host-service channel.
`context.unavailable(message)` preserves producer-owned caches and emits a
diagnostic. Existing behavior allowing cached unsupported dependencies remains;
circular references cannot be hidden by cached dependency values.

PY is only eligible as the entire public formula, with a literal code string.
Nested PY is rejected even in unselected branches. Numeric OOXML Python script
indices require script-part resolution, which is not implemented: those formulas
retain caches without reaching a host handler. There is no implicit network,
DLL loading, Python interpreter, or other arbitrary code execution.

## Remaining integration limits

This runtime is not a claim of complete Excel parity. Union/intersection
reference operators, multi-area INDEX, 3D/external references, R1C1 INDIRECT,
and reference-valued range endpoints are not implemented. Local implicit table
references without an explicit table name and sheet-qualified defined names
are not parsed. Relative defined-name formulas are interpreted at the formula
location rather than rebased from an OOXML saved active-cell origin.
Database computed-criteria relative formula reevaluation has no dedicated hook.
Legacy text builtins retain their prior UTF-16 string-index behavior; Unicode
Compatibility Version 2 behavior is not claimed. Each category must document
additional coercion, array-lifting, locale, service, and argument limitations.
Saved dynamic-array cache cells are not distinguished from ordinary occupied
source cells without OOXML spill metadata; such caches can obstruct a new spill.
Array size and spill results from real Excel remain coordinator-owned oracle work.

Validation includes the pre-existing formula and sheets suites, shared-context
unit tests, 200 generated row/column arithmetic cases, actual uncached XLSX
fixtures, no-mutation checks, edits/reopen, cross-sheet ordering, and text-overflow
integration. The coordinator owns the comprehensive generated-document corpus
and independent reviews; those are not claimed by this branch.

Single-cell workbook/table reference objects retain the same internal range provenance as direct references, including text/boolean exclusion in aggregates.

PRODUCT returns zero when its referenced/array arguments contain no numeric values. Referenced text, booleans and blanks remain ignored; adding a numeric argument still multiplies that argument normally.

The INDIRECT geometry resolver sends complete supported structured-reference tokens to the workbook resolver before applying cell-address style restrictions. The A1/R1C1 switch does not change table geometry, including table names beginning with R and column labels containing `!`.
