# Math category

`packages/formulas/src/functions/math.ts` exports `mathFunctions: FunctionRegistry`.
All 65 assigned names have numeric/string/array implementations and success and
error cases. None requires a host service or cache fallback. Functions consume
`context.evaluate`, use `context.random` for volatility, and charge loops and
allocations to `context.operation` and `context.maxArrayCells`. Scalar numeric
functions broadcast rectangular arrays over singleton dimensions. Matrix and
sequence outputs use the shared `FunctionArray` contract.

## Integration dependencies

The coordinator must register the registry, supply evaluated reference matrices,
injected RNG and operation limits, and implement spill placement/preservation.
Optional arguments recognize the coordinator's `{kind:'omitted'}` convention;
blank cell values continue to coerce to zero. No shared files were changed.
Math consumes date serials as numbers in either date system. No calendar-based
conversion is involved. Four seeded RNG fixtures are marked
`oracle: 'nondeterministic'` and specify `random: .25`; fixed expected random
values apply only to the injected local RNG, not an unseeded Excel oracle.

## Semantics and algorithms

Unary functions use ECMAScript double-precision transcendental algorithms with
Excel domains and error handling. ACOT uses the (0, pi) branch, ATAN2 takes x then
y, and reciprocal trig poles produce division errors. Numeric outputs reject
nonfinite values and flush subnormal results to positive zero, consistent with
Excel worksheets. Hyperbolic secant uses a stable negative exponential.

Factorials stop at finite double limits. Combinations use a multiplicative
recurrence, multinomial coefficients use successive combinations, and GCD/LCM
use Euclid's algorithm with the 2^53 domain bound. All iterative work is charged.
Matrix determinant and inverse use partial pivot elimination; determinant product
overflow/underflow uses a logarithmic fallback. No fixed epsilon rejects small
nonzero pivots. Matrix text, logicals and blank entries return VALUE errors.
Reference aggregates ignore nonnumeric entries but propagate errors; literal
aggregate numbers, numeric strings and logicals coerce. Paired sums skip positions
with nonnumeric values and reject unequal array lengths. ROMAN implements forms
0 through 4 and boolean forms. ARABIC accepts case-insensitive, signed Roman text.
Decimal conversion validates all digits before accumulation. TRUNC shifts decimal
exponents to avoid intermediate multiplication noise.

## Verification and remaining limits

Direct category tests use the real parser and a category-local context; this is
not a substitute for the coordinator's uncached XLSX, edit, reopen and independent
consumer tests. Each name has meaningful success and edge/error coverage.
Additional tests cover reference/literal coercion, propagated errors, omitted
arguments, array broadcasting, operation and allocation limits, pivoting,
singular matrices, overflow, underflow, extremes, defaults and both date systems.

The implementation uses double arithmetic, not Excel's proprietary math library.
Last-bit differences, ill-conditioned matrices, extreme cancellation and ambiguous
decimal MROUND midpoint behaviour may differ. Native Excel verified that
COMBINA permits chosen counts above the population, ARABIC accepts "IIX",
RANDBETWEEN handles fractional negative bounds, RANDARRAY permits equal bounds,
and BASE/ROMAN truncate their tested fractional arguments. Broader boundary
differences remain subject to the independent generated-document corpus.
Scalar numeric lifting is implemented; string conversions, matrix constructors
and SERIESSUM's scalar parameters currently consume the first scalar of an
array. Full elementwise array lifting of those nonnumeric/special functions is
not claimed. No Excel application automation was run by this category thread.
Independent GPT-6.1 sol high reviews remain the coordinator's readiness gate.

## Fixture inventory, provenance and license

`packages/formulas/test/fixtures/math.ts` exports the exact `cases` corpus schema:
full scalar values or rectangular scalar matrices, optional Inputs-sheet cells,
absolute tolerance, date system and RNG/oracle metadata. Inputs use `Inputs!A1`
references and contain no calculated caches. Every case can be placed in its own
Inputs/Results workbook. There are 227 corpus cases: 223 ordinary and four
nondeterministic RNG cases. The corpus includes every assigned name, nested
engineering calculations, range aggregates, matrix operations and date serials.

Cases and code are independently authored for Tumbler under the repository MIT
license. Expected values are elementary mathematical identities, independently
computed constants, or public function behaviour; no Microsoft workbook or prose
is redistributed. ROMAN 499 forms follow Microsoft's published examples.

Primary Microsoft sources consulted (2026-11-08):

- [Math and trigonometry function catalog](https://support.microsoft.com/en-au/excel/math-and-trigonometry-functions-reference), including links to individual syntax, domains and defaults.
- [BASE](https://support.microsoft.com/en-us/excel/functions/base-function), [DECIMAL](https://support.microsoft.com/en-us/excel/functions/decimal-function), [ARABIC](https://support.microsoft.com/en-us/excel/functions/arabic-function), [ROMAN](https://support.microsoft.com/en-us/excel/functions/roman-function).
- [COMBINA](https://support.microsoft.com/en-us/excel/functions/combina-function), [FACTDOUBLE](https://support.microsoft.com/en-us/excel/functions/factdouble-function), [GCD](https://support.microsoft.com/en-us/excel/functions/gcd-function), [LCM](https://support.microsoft.com/en-us/excel/functions/lcm-function).
- [MDETERM](https://support.microsoft.com/en-us/excel/functions/mdeterm-function), [MINVERSE](https://support.microsoft.com/en-us/excel/functions/minverse-function), [MMULT](https://support.microsoft.com/en-us/excel/functions/mmult-function).
- [RAND](https://support.microsoft.com/en-us/excel/functions/rand-function), [RANDARRAY](https://support.microsoft.com/en-us/excel/functions/randarray-function), [RANDBETWEEN](https://support.microsoft.com/en-us/excel/functions/randbetween-function).
- [PERCENTOF](https://support.microsoft.com/en-us/excel/functions/percentof-function), [SERIESSUM](https://support.microsoft.com/en-us/excel/functions/seriessum-function), [SUMXMY2](https://support.microsoft.com/en-us/excel/functions/sumxmy2-function), [TRUNC](https://support.microsoft.com/en-us/excel/functions/trunc-function).
- [Worksheet numeric limits and subnormals](https://learn.microsoft.com/en-us/office/client-developer/excel/excel-worksheet-and-expression-evaluation).

## Independent review follow-up

Review regressions cover FACT fractional arguments in (170,171), which truncate before overflow checking, and MROUND opposite-sign normal inputs whose product would underflow to signed zero. Sign validation compares signs directly.
