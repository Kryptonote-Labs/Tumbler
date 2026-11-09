# Statistical formula calculation

Tumbler implements the 111 functions in Microsoft's Statistical function catalog
through the shared formula runtime. Existing conditional aggregates and counts
continue to use the evaluator's built-in handlers. The additional handlers live
in `packages/formulas/src/functions/statistics/`, grouped by calculation family.

## Specification and verification

- ECMA-376 Part 1 §18.17.7 defines the original statistical functions, including
  argument provenance, type coercion, mathematical definitions, and errors.
- MS-XLSX §2.2.2 and Microsoft's individual function references define successor
  names, added arguments, and newer functions. Stored future functions use
  `_xlfn.` names; the evaluator accepts both stored and user-facing spellings.
- MS-OI29500 records Office's choices where ECMA leaves a result unspecified.
- The independent fixture generator uses SciPy for distributions, quantiles,
  hypothesis tests and regression, and exact arithmetic for simple examples.
  It does not import or execute Tumbler. Python and SciPy are qualification tools,
  not runtime dependencies.
- Uncached XLSX tests verify calculated values, spill cells, immutable bytes,
  unrelated edits, and save/reopen. Focused tests cover coercion, errors,
  extreme probabilities, dependent regression predictors, and operation budgets.

The interactive demonstration is `/playground/statistical` in the docs app.
Choose a function, enter its example, and calculate it against the independent
expected result. It uses the real spreadsheet artifact and grid.

## Forecasting qualification

The four `FORECAST.ETS` functions implement deterministic additive error, trend
and seasonality, with bounded parameter fitting, repeated periods, numeric
constant-step timelines, duplicate aggregation and missing-point completion.
Automatic detection uses detrended repetition. Confidence intervals use the
fitted additive model's analytic prediction variance.

ECMA does not define these newer functions. Microsoft's public references do not
specify Excel's exact optimizer, automatic period selection, initialization or
confidence interval simulation. These implementations do not claim numerical
parity with Excel's private model fitting. The four catalog fixtures use an
analytically exact linear sequence. Calendar-month normalization is not yet
implemented; use numeric constant-step timelines.

## Reproduce

```sh
bun run check
bun run docs:check
bun test packages/formulas/test packages/sheets/test
bun scripts/formula-conformance/generate.ts --category statistical
```

To rebuild independent expected values, install `numpy` and `scipy` in a disposable
Python environment, then run `scripts/formula-conformance/statistical-oracle.py`.
To compare native spreadsheet consumers, use `buildFormulaDocument(fixture, true)`
from the conformance harness. That writes future-function prefixes and legacy
array formula metadata appropriate for those consumers.

Sources:

- https://ecma-international.org/publications-and-standards/standards/ecma-376/
- https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/3d025add-118d-4413-9856-ab65712ec1b0
- https://support.microsoft.com/en-us/excel/statistical-functions-reference
- https://support.microsoft.com/en-us/excel/functions/forecast-ets-function
- https://support.microsoft.com/en-us/excel/functions/forecast-ets-confint-function
