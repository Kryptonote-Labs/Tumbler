# Logical formula category

Exports `logicalFunctions: FunctionRegistry` from
`packages/formulas/src/functions/logical.ts` for BYCOL, BYROW, FALSE, LAMBDA,
LET, MAKEARRAY, MAP, REDUCE, SCAN, TRUE. All ten have real local implementations;
none requires a host service, cache fallback, network, or executable code.

## Semantics and sources

Microsoft primary references consulted 2026-11-08:

- [TRUE](https://support.microsoft.com/en-us/excel/functions/true-function) and
  [FALSE](https://support.microsoft.com/en-us/excel/functions/false-function):
  zero-argument boolean constants, including arithmetic use.
- [LET](https://support.microsoft.com/en-us/excel/functions/let-function):
  sequential lexical bindings (1–126 pairs), case-insensitive names, nested scopes.
- [LAMBDA](https://support.microsoft.com/en-us/excel/functions/lambda-function):
  closures, zero through 253 parameters, invocation arity checks, valid names
  without periods, unevaluated bodies. The evaluator must convert an uninvoked
  top-level closure to #CALC! and bound recursion.
- [BYCOL](https://support.microsoft.com/en-gb/excel/functions/bycol-function) and
  [BYROW](https://support.microsoft.com/en-us/excel/functions/byrow-function):
  one-parameter callbacks receive whole column/row arrays and return one value.
- [MAKEARRAY](https://support.microsoft.com/en-us/excel/functions/makearray-function):
  positive dimensions, one-based row/column callback indices, two parameters.
- [MAP](https://support.microsoft.com/en-us/excel/functions/map-function):
  one callback parameter per input array; mapped scalar results retain shape.
- [REDUCE](https://support.microsoft.com/en-us/excel/functions/reduce-function)
  and [SCAN](https://support.microsoft.com/en-us/excel/functions/scan-function):
  two-parameter accumulator callbacks traverse row-major order. REDUCE can carry
  an array accumulator; SCAN stores scalar intermediates. REDUCE's omitted seed
  uses the first input element, following Microsoft's explicit current note;
  SCAN starts at zero when omitted. Text accumulation uses an explicit empty string.

No numeric approximation algorithms are needed: arithmetic is delegated to the
shared evaluator. Dimensions require positive integers and reject values below
one, and are bounded by worksheet limits (1,048,576 rows, 16,384 columns) and
`maxArrayCells`. Callback iteration, dimension validation, and row/column
construction charge `context.operation`. Allocation-budget failures return
#NUM!; operation-budget exceptions deliberately propagate to the evaluator.
Nested arrays returned by scalar-result helpers produce #CALC!; 1×1 callback
arrays are unwrapped. Blank mapped values become zero. Input scalar errors are
passed to callbacks so a callback may handle them rather than forcing propagation.

## Shared engine dependencies

Category code calls `context.evaluate`, `context.withBindings` and receives
`FunctionLambda`/`FunctionArray` values. It does not implement another evaluator.
It structurally recognizes the agreed AST nodes `{kind:'name',name:string}` and
`{kind:'omitted'}` pending their integration. `_xlpm.` parameter prefixes used in
XLSX storage are normalized. The confirmed `{kind:'omitted'}` FunctionValue passes
through lambda bindings unchanged; array inputs coerce it to blank and materialized
scalar outputs coerce that blank to zero, matching the shared helpers.

Integration must provide immutable lexical child contexts with case-insensitive
lookup, named and expression lambda invocation, zero-argument TRUE/FALSE calls
(the old parser treats these tokens as literals), `_xlfn.` normalization, dynamic
array spilling, top-level lambda rejection, and recursion/operation limits.
References used as function arguments must evaluate to values/rectangular arrays.
The evaluator owns Name Manager resolution, array arithmetic, dependency tracking,
and result materialization. No new metadata hooks or host services are needed.

LET value expressions are evaluated once sequentially through `withBindings`;
this contract cannot defer an unused binding's computation. Consequently Excel's
possible unused-binding evaluation optimization and self-recursive LET bindings
are not claimed. Workbook named recursion depends on engine name resolution.
MAP currently pads unmatched input shapes with #N/A and passes those values to
the callback. This behavior, dimension coercion of numeric text/booleans and
fractions, omitted REDUCE seeding, and nested-array errors need independent Excel
oracle confirmation before integrated readiness. No Excel instance was driven
by this category worktree, to avoid concurrent access with the coordinator.

## Tests and generated-document fixtures

`packages/formulas/test/fixtures/logical.ts` exports 63 deterministic cases in the
shared `cases` schema. Every expectation is a full scalar or rectangular scalar
matrix. All cell keys are A1-style Inputs-sheet keys; every formula input reference
uses `Inputs!A1` (or an Inputs-qualified range). Cases contain standalone constants,
nested calls, named lambda calls through LET, lexical capture/shadowing, row/column
sums, multiplication tables, transforms, row-major running totals, text folds,
coercion of literal/reference text and blanks, overflow, tiny numbers, invalid
arity/names, nested-array rejection, and 1900/1904 serial identity cases. These
functions do not interpret date serials, so the identity cases verify preservation
rather than calendar conversion. No service/nondeterministic flags are needed.

The test file runs all 63 fixtures against a category-local contract context.
It reuses the existing parser through temporary sentinel calls for name/omitted
nodes and TRUE/FALSE calls. This is test infrastructure only and does not prove
shared parser/evaluator or XLSX integration. Seven additional tests cover lazy lambda
bodies, zero parameters, the 253/126 parameter/binding limits, invalid names,
array-cell and operation budgets, near-boundary dimensions, and function arity.
The parent harness must generate real uncached XLSX workbooks, verify recalculation,
edits, reopen, preservation, and compare independent consumer/Excel results.

Fixtures and expected values are original, hand-calculated examples authored for
this repository and licensed under the repository MIT license. Microsoft pages
provide semantics only; no external workbook, screenshot, or dataset is copied.
The multiplication-table and running-product patterns are commonplace mathematical
examples. Expectations are not Excel-cached results and are not yet oracle-certified.

Validation: `bun test packages/formulas/test/logical.test.ts` (70 passing tests),
`bun run check`, and the existing formulas test suite. Readiness additionally
requires the coordinator's generated-document tests and independent GPT-6.1 sol
high reviews; this category does not open a PR or assert project readiness.
