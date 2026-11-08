# Excel compatibility functions

This category implements 40 legacy Excel names in `compatibilityFunctions` from
`packages/formulas/src/functions/compatibility.ts`. All 40 calculate locally;
zero require host services. No implicit network access, Excel automation, cache
fallbacks, other category modules, or third-party runtime dependencies are used.

## Semantics and implementation

The semantic authority is Microsoft's [compatibility function reference](https://support.microsoft.com/en-gb/excel/compatibility-functions-reference)
and its per-function pages linked below. Legacy argument lists and tail direction
are preserved rather than mechanically renaming functions to newer aliases.

| Names (Microsoft primary documentation) | Behavior |
| --- | --- |
| [BETADIST](https://support.microsoft.com/en-gb/excel/functions/betadist-function), [BETAINV](https://support.microsoft.com/en-gb/excel/functions/betainv-function) | Cumulative beta and inverse; optional lower/upper bounds default to 0/1; legacy inverse rejects probability zero. |
| [BINOMDIST](https://support.microsoft.com/en-gb/excel/functions/binomdist-function), [CRITBINOM](https://support.microsoft.com/en-gb/excel/functions/critbinom-function) | Binomial mass/CDF and smallest integer reaching the criterion; integer arguments truncate. CRITBINOM requires strictly interior success probability and criterion. |
| [CEILING](https://support.microsoft.com/en-us/excel/functions/ceiling-function), [FLOOR](https://support.microsoft.com/en-gb/excel/functions/floor-function) | Signed significance rules, decimal multiple tolerance, and zero significance handling. |
| [CHIDIST](https://support.microsoft.com/en-gb/excel/functions/chidist-function), [CHIINV](https://support.microsoft.com/en-gb/excel/functions/chiinv-function), [CHITEST](https://support.microsoft.com/en-gb/excel/functions/chitest-function) | Right chi-square tail/inverse and independence test using matrix geometry for degrees of freedom. |
| [CONFIDENCE](https://support.microsoft.com/en-gb/excel/functions/confidence-function), [COVAR](https://support.microsoft.com/en-gb/excel/functions/covar-function) | Normal confidence interval half-width and population covariance with pairwise numeric filtering. |
| [EXPONDIST](https://support.microsoft.com/en-gb/excel/functions/expondist-function), [WEIBULL](https://support.microsoft.com/en-gb/excel/functions/weibull-function) | Density or CDF selected by cumulative argument. Tiny CDFs use expm1. |
| [FDIST](https://support.microsoft.com/en-gb/excel/functions/fdist-function), [FINV](https://support.microsoft.com/en-gb/excel/functions/finv-function), [FTEST](https://support.microsoft.com/en-gb/excel/functions/ftest-function) | Right F tail/inverse; two-tailed variance comparison. |
| [GAMMADIST](https://support.microsoft.com/en-gb/excel/functions/gammadist-function), [GAMMAINV](https://support.microsoft.com/en-gb/excel/functions/gammainv-function) | Gamma density/CDF/inverse with shape and scale. |
| [HYPGEOMDIST](https://support.microsoft.com/en-gb/excel/functions/hypgeomdist-function), [NEGBINOMDIST](https://support.microsoft.com/en-gb/excel/functions/negbinomdist-function) | Discrete probability masses using log-gamma to avoid factorial overflow. |
| [LOGINV](https://support.microsoft.com/en-gb/excel/functions/loginv-function), [LOGNORMDIST](https://support.microsoft.com/en-gb/excel/functions/lognormdist-function) | Lognormal inverse/CDF; positive standard deviation required. |
| [NORMDIST](https://support.microsoft.com/en-gb/excel/functions/normdist-function), [NORMINV](https://support.microsoft.com/en-gb/excel/functions/norminv-function), [NORMSDIST](https://support.microsoft.com/en-gb/excel/functions/normsdist-function), [NORMSINV](https://support.microsoft.com/en-gb/excel/functions/normsinv-function) | Normal density/CDF/inverse, with direct small-tail evaluation. |
| [MODE](https://support.microsoft.com/en-gb/excel/functions/mode-function), [RANK](https://support.microsoft.com/en-gb/excel/functions/rank-function) | Smallest tied mode, duplicate rank gaps, descending default or ascending order. |
| [PERCENTILE](https://support.microsoft.com/en-gb/excel/functions/percentile-function), [QUARTILE](https://support.microsoft.com/en-gb/excel/functions/quartile-function), [PERCENTRANK](https://support.microsoft.com/en-gb/excel/functions/percentrank-function) | Inclusive interpolation, truncated quartile argument, percentage rank with default three decimal digits. |
| [POISSON](https://support.microsoft.com/en-gb/excel/functions/poisson-function) | Poisson mass/CDF; mean zero is a degenerate point mass at zero. |
| [STDEV](https://support.microsoft.com/en-gb/excel/functions/stdev-function), [STDEVP](https://support.microsoft.com/en-gb/excel/functions/stdevp-function), [VAR](https://support.microsoft.com/en-gb/excel/functions/var-function), [VARP](https://support.microsoft.com/en-gb/excel/functions/varp-function) | Sample/population moments using Welford accumulation. Direct numeric strings/logicals count; text/logicals/blanks inside arrays or references do not. |
| [TDIST](https://support.microsoft.com/en-gb/excel/functions/tdist-function), [TINV](https://support.microsoft.com/en-gb/excel/functions/tinv-function), [TTEST](https://support.microsoft.com/en-gb/excel/functions/ttest-function) | One/two right tails; two-tailed inverse; paired, pooled, and Welch tests. Welch uses fractional effective degrees of freedom. |
| [ZTEST](https://support.microsoft.com/en-gb/excel/functions/ztest-function) | One-tailed normal test; omitted sigma uses sample standard deviation. |

Scalar distribution/rounding handlers broadcast array arguments, returning a
rectangular array with individual cell errors. Aggregate, rank, quantile, and
hypothesis-test arguments consume numeric array/reference data. Reference error
values propagate. Error results are actual formula errors rather than producer
cache values. Date inputs are numeric serials; these statistical functions do not
interpret a calendar, and fixtures verify both workbook date systems.

Optional arguments recognize the announced shared `{kind: 'omitted'}` convention
without adding a competing runtime value type. Required integration is registry
registration and the existing FunctionContext evaluation/array/operation hooks.
No changes to the shared runtime, evaluator, parser, lexer, AST, or sheets are
included in this category commit.

The numerical kernels use Lanczos log-gamma, bounded incomplete-beta continued
fractions, incomplete-gamma series/continued fractions, and bracketed inverses.
Continued fractions/series allow at most 1024/4096 iterations; inverses allow
1024 bracket expansions and 1100 bisections. Iterations charge context.operation;
array processing charges work and checks maxArrayCells before allocating output.
Operation-budget exceptions remain owned by the evaluator and are not swallowed.
Nonconvergence and nonfinite numeric results return #NUM!.

## Fixture inventory and provenance

`packages/formulas/test/fixtures/compatibility.ts` exports `cases` in the shared
schema: names, formulas without equals signs, full scalar or rectangular scalar
expectations, optional Inputs-sheet cells, date system, tolerance, and oracle
metadata. Each case is suitable for an individual uncached XLSX workbook. All
references explicitly use `Inputs!A1`-style addresses. No services or nondeterminism
are involved, so no case is excluded from ordinary local calculation.

The 314 fixtures comprise:

- 40 numeric successes, 40 domain/coercion errors, 40 propagation errors, and 40
  nested expressions (every name has all four).
- 44 additional defaults, boundaries, truncation, coercion, overflow, stable
  moments, tails, and serial-date cases.
- 78 scalar numeric-reference, numeric-text-reference, and invalid-text-reference
  cases across 26 scalar handlers.
- 22 independent beta, gamma, and t distribution grid cases.
- Eight endpoint cases independently observed by the coordinator in native
  Microsoft Excel for Mac 16.114.4, explicitly marked `oracle: 'excel'`.
- Two array-result cases exercising numeric results and per-cell errors.

Synthetic fixture inputs and numeric expectations are original project test data,
distributed under the repository's MIT license. Most distribution expectations
were computed independently with SciPy 1.18.0; no SciPy source code is included.
Simple identities supply exact expectations. The t distribution with one degree
of freedom near zero uses the exact Cauchy identity rather than SciPy's less
accurate survival-function result. Mathematical constants and algorithms are
implemented locally; no Microsoft documentation text or workbook was imported.
Microsoft documentation supplies semantic requirements, not copied fixture files.

Native Excel evidence fixes these concrete endpoints: BETAINV probability zero,
CRITBINOM success-probability/criterion zero, GAMMAINV probability one, and CHIINV
probability zero return #NUM!; POISSON(0,0,FALSE) returns 1;
GAMMADIST(0,.5,1,FALSE) returns #NUM!; WEIBULL(0,.5,1,FALSE) returns 0.

## Validation and remaining limits

Run `bun test packages/formulas/test/compatibility.test.ts`,
`bun test packages/formulas/test`, and `bun run check`.
The local context adapter exercises the category without modifying the shared
evaluator. Tests include every fixture, all-name arity checks, reference versus
literal coercion, arrays and broadcasting, omitted defaults, error propagation,
operation/array limits, density scale overflow/underflow, relative accuracy for
small tails, and inverse round trips close to boundaries.

Full generated-document recalculation, edit/reopen/preservation tests, broad native
Excel oracle comparison, and independent GPT-6.1 sol high reviews are coordinator
integration work. This category commit does not claim that those have passed.

Numerical calculations use JavaScript doubles and need not reproduce Excel's last
bit. Extremely large shape/count parameters can lose accuracy through log-gamma
subtraction or reach the bounded convergence limit. Subnormal probabilities can
underflow, and extreme intermediate ratios can lose representable tails. Integer
counts above JavaScript's safe integer range are not promised exact discrete
semantics. Legacy implicit-intersection behavior in pre-dynamic-array workbooks
and workbook spill placement remain evaluator integration concerns. The primary
legacy documentation's CRITBINOM upper endpoints are rejected; native Excel
confirmation of those neighboring endpoints was requested from the coordinator.
