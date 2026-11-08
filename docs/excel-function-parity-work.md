# Excel function parity implementation

The integration branch is `feat/excel-function-parity`. Category worktrees branch
from its shared runtime contract. Each category owns its module, tests, fixture
cases, and notes. The coordinator owns evaluator/parser/sheets integration.

## Module contract

Create `packages/formulas/src/functions/<category>.ts` exporting
`<camelCaseCategory>Functions: FunctionRegistry`, using types/helpers from
`../function-runtime.ts`. Handlers receive raw AST arguments and FunctionContext;
use context.evaluate for values and context.reference for reference geometry.
Array values have `kind: "array"` and a rectangular `rows` matrix of scalar
values. Scalar values retain the existing evaluator's `type` discriminant.
Do not create ad-hoc competing value types or change the shared contract without
coordinating. Runtime integration is owned by the parent thread.

Each category adds `packages/formulas/test/<category>.test.ts` and
`packages/formulas/test/fixtures/<category>.ts`. The fixture module exports
`cases`, an array of objects with `name`, `formula` (without leading equals),
`expected` (a scalar value or rectangular scalar matrix), and optional
`cells: Record<string, FormulaScalarValue>` (A1 references on Inputs sheet).
Optional `dateSystem: "1900" | "1904"` selects dates; optional `tolerance` is
absolute numeric tolerance. Formula cells are placed on Results sheet; references
to fixture inputs must use `Inputs!A1`. Include standalone, nested, edge/error,
and realistic use cases. Document fixture provenance in
`docs/formula-categories/<category>.md`. The coordinator converts these cases
into uncached XLSX documents and verifies actual calculation, edits, reopen,
preservation, and independent-consumer results where available.

Do not modify evaluator.ts, parser.ts, lexer.ts, ast.ts, sheets integration,
package manifests, or shared docs in category branches. Report necessary runtime
changes and dependencies explicitly. Implement actual behavior; placeholders,
unconditional errors, or cached values do not establish function support.
Externally provided services must use explicit context.services and preserve
caches with context.unavailable when absent. No arbitrary code execution or
implicit network access. All loops and allocations must honor operation and
maxArrayCells budgets. No new agents or PRs from category implementation threads.

Every listed name must have meaningful tests, not just a registration assertion.
Use Microsoft primary documentation for semantics. Correctness includes argument
counts, error propagation, reference versus literal coercion, optional defaults,
date-system differences, and bounds. Report unsupported semantics honestly.
Commit changes and report commit SHA, file list, tests, and limitations to the
coordinator. Do not report this project ready until integrated tests and fresh
GPT-6.1 sol high independent reviews are clean.
