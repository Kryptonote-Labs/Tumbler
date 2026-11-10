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
It uses the shared AST name and omitted-argument nodes. `_xlpm.` parameter prefixes used in
XLSX storage are normalized. The confirmed `{kind:'omitted'}` FunctionValue passes
through lambda bindings unchanged; array inputs coerce it to blank and materialized
scalar outputs coerce that blank to zero, matching the shared helpers.

The merged runtime provides immutable lexical child contexts with case-insensitive
lookup, named and expression lambda invocation, zero-argument TRUE/FALSE calls,
`_xlfn.` normalization, dynamic array spilling, top-level lambda rejection, and
recursion/operation limits.
References used as function arguments must evaluate to values/rectangular arrays.
The evaluator owns Name Manager resolution, array arithmetic, dependency tracking,
and result materialization. No new metadata hooks or host services are needed.

LET value expressions are evaluated once sequentially through `withBindings`;
this contract cannot defer an unused binding's computation. Consequently Excel's
possible unused-binding evaluation optimization and self-recursive LET bindings
are not claimed. Workbook named recursion depends on engine name resolution.
MAP pads unmatched array/reference shapes with #N/A and passes those values to
the callback. In multi-input MAP calls, scalar constants are rejected with #VALUE!;
one-cell references and explicit one-cell arrays remain array inputs. Native
Excel 16.114.4 probes confirm these distinctions, forwarded omitted REDUCE seeds,
scalar callback-array unwrapping, and fractional MAKEARRAY rejection.

Scoped LET/LAMBDA values and returns opt into `withBindings(..., true)` to retain
reference provenance. The evaluator keeps this metadata in a private WeakMap;
the exported FunctionValue union is unchanged. Reference geometry also survives
scoped aliases/returns for consumers such as SUMIF and INDEX. Computed arrays do
not acquire invented reference geometry, and one-cell reference arithmetic stays
scalar at merged anchors. Computed INDEX inputs are evaluated once when trying
reference and value forms. Binding names support Unicode letters, and LET rejects
a repeated name in the same scope (nested shadowing remains supported).
Whole-axis bindings retain geometry until a consumer requests their cells;
blank-insensitive aggregates scan the used extent. MAP retains the full input
shape and reports an exceeded calculation budget instead of trimming its output.

## Tests and generated-document fixtures

`packages/formulas/test/fixtures/logical.ts` exports 82 deterministic cases in the
shared `cases` schema. Every expectation is a full scalar or rectangular scalar
matrix. All cell keys are A1-style Inputs-sheet keys; every formula input reference
uses `Inputs!A1` (or an Inputs-qualified range). Cases contain standalone constants,
nested calls, named lambda calls through LET, lexical capture/shadowing, row/column
sums, multiplication tables, transforms, row-major running totals, text folds,
coercion of literal/reference text and blanks, overflow, tiny numbers, invalid
arity/names, nested-array rejection, and 1900/1904 serial identity cases. These
functions do not interpret date serials, so the identity cases verify preservation
rather than calendar conversion. No service/nondeterministic flags are needed.

The test file runs all 82 fixtures against a category-local contract context.
It uses the production parser directly, with a local context for isolated handler
checks. The shared conformance suite also calculates all fixtures through real
uncached XLSX documents, edits, reopen, and byte preservation. Seven additional
tests cover lazy lambda
bodies, zero parameters, the 253/126 parameter/binding limits, invalid names,
array-cell and operation budgets, near-boundary dimensions, and function arity.
Native Excel comparisons are coordinated serially through the generated-document
oracle; rejected formula entries are reported separately from matching values.

Fixtures and expected values are original, hand-calculated examples authored for
this repository and licensed under the repository MIT license. Microsoft pages
provide semantics only; no external workbook, screenshot, or dataset is copied.
The multiplication-table and running-product patterns are commonplace mathematical
examples. Expectations are authored values. Native observations are qualified below.

Validation includes the production parser, isolated context tests, generated
uncached XLSX calculations, merged-cell/reference regressions, edits/reopen, and
source-byte preservation. PR #230 remains subject to CI and independent GPT-6.1
sol high review; this is not a project-wide Excel parity claim.

## Native Excel qualification

Excel 16.114.4 produced matching values for 74 of the 82 corpus cases. The other
eight were rejected by Excel's formula-entry API and are recorded separately;
they are not counted as matching native cell-error results. No executable case
has an unresolved value mismatch. Additional direct probes confirm reference
geometry through LET/LAMBDA returns in SUMIF.

The oracle writes public formula syntax during entry validation and uses OOXML
future-function/parameter spellings in generated files. It reads native error
labels for saved error cells, because modern errors such as #CALC! can serialize
as legacy #VALUE! caches plus rich metadata. Resume requires that error-label
evidence for error expectations. Tests do not treat a plain error-looking string
as an error, since the saved cell must also have error type.

## Reference-path review follow-up

Workbook-defined callable names and aliases now use the same provenance-preserving reference path as lexical lambdas. Classification inspects name metadata; the callable body is evaluated once. Two supplemental native Excel workbooks confirm `SUMIF(Identity(Inputs!A1:A2),">1")` and its workbook-name alias both return 6 for inputs 2 and 4.

Once INDEX has established a reference form, row/column errors are final and are not retried as value-form arguments. Regression workbooks check changing callback results, original error propagation, nested INDEX, bare/scoped/named references, edits and reopen, with exactly one callback evaluation.
