# Engineering formulas

`packages/formulas/src/functions/engineering.ts` exports `engineeringFunctions`, a
54-entry registry using the shared `FunctionContext`. All 54 names calculate
locally; zero names require services, caches, DLLs, network access, or host code.
There are no imports from another category. Register this map in the evaluator.

Implemented families: BESSELI/J/K/Y; all twelve BIN/DEC/HEX/OCT conversions;
BITAND/OR/XOR/LSHIFT/RSHIFT; COMPLEX and all 25 IM functions; CONVERT; DELTA;
GESTEP; ERF, ERF.PRECISE, ERFC, ERFC.PRECISE.

## Semantics and numeric methods

Radix conversion uses ten-digit two's-complement widths (10, 30, 40 bits), signed
output bounds, optional padding, uppercase hexadecimal, and decimal truncation.
Bitwise operations use BigInt internally to retain all 48 supported bits.
Negative shift amounts reverse direction; shift magnitudes above 53 and overflow
produce NUM errors. Scalar numeric coercion uses the shared helper; complex
logical arguments produce VALUE errors. Input errors propagate before conversion.

Complex numbers accept real numeric values and signed real/imaginary strings,
including scientific notation and lowercase i/j. Arithmetic uses rectangular
coordinates, scaled division, integer exponentiation, stable square roots, and
principal logarithms/powers. IMSUM and IMPRODUCT reduce ranges. Other functions
broadcast rectangular arrays with singleton dimensions. Numeric/date serials are
ordinary numbers in either date system; this category performs no date parsing.

ERF uses a direct convergent series near zero. ERFC uses the regularized gamma
series or continued fraction, avoiding subtraction of nearly equal numbers in
the positive tail. Bessel I uses logarithmically scaled positive series; J uses
series or bounded trigonometric quadrature; Y uses its integer-order integral
representation; K uses its exponentially decaying integral. Large-argument J/Y
use optimally truncated asymptotic expansions. Every numerical iteration and
output cell charges the context operation budget. Output size and range
reductions honor maxArrayCells. Recursion and series also have explicit caps.

CONVERT includes the documented mass, distance, time, pressure, force, energy,
power, magnetism, temperature, volume, area, information, and speed groups,
aliases, metric prefixes (including powers for square/cubic units), and binary
information prefixes. Names and prefixes are case sensitive; incompatible or
unknown units produce NA errors. Affine temperature scales are supported.

## Integration requirements and known limitations

The current shared lexer splits BIN2DEC into reference BIN2 plus identifier DEC;
all twelve radix names need the coordinator's function-identifier precedence
fix. The test harness adds `_xlfn.` before these names during parsing and removes
it during dispatch. Fixtures retain the exact normal Excel formulas. This is a
local test workaround, not a production parser change or a claim of integrated
support. No other engine change is required beyond registering this registry
and supplying the shared context. The announced `{kind:'omitted'}` convention is
handled structurally because this category's shared-runtime base predates its
union member: trailing optional omissions take defaults, required omissions are
blank numeric inputs.

Bessel order is truncated, must be nonnegative, and is bounded to 4096. I is
bounded to |x| <= 10000; J/Y quadrature is bounded to |x| <= 10000 unless the
large-argument asymptotic branch applies (x >= 32, n² < x). Inputs beyond these
implementation bounds produce NUM errors even where Excel might return a finite
value. Quadrature recursion is capped at 18 levels; accuracy outside the tested
grid is not independently certified. Overflow returns NUM and floating-point
underflow returns zero. These are substantive numeric implementations, but not a
claim of unlimited Excel numerical parity.

Complex result coefficients use 15 significant digits. Native Excel verifies
fixed decimal notation for exponents -19 through 20, and uppercase signed
scientific notation outside that window. Exact cosine/exponential strings and
the formatting boundaries have dedicated fixtures; nontrivial identities also
exercise IMREAL/IMAGINARY/IMABS. Mixed i/j suffixes with nonzero imaginary coefficients are
rejected; suffix treatment with zero coefficients and reference/literal boolean
coercion need the parent Excel oracle. CONVERT uses modern physical constants;
Excel may retain historical constants for atomic mass, electron volts, parsecs,
and mercury pressure. Exact parity for those constants needs oracle confirmation.

No Excel automation was run by this category, to avoid concurrent access to the
parent's oracle. Generated XLSX calculation, editing, reopening, preservation,
independent consumer validation, and fresh independent GPT-6.1 sol high reviews
remain the coordinator's integration responsibilities. Category completion does
not mean the integrated project is ready.

## Fixture inventory and provenance

`packages/formulas/test/fixtures/engineering.ts` exports `cases` in the shared
schema: name, formula without equals, full scalar expected values or rectangular
scalar matrices, optional Inputs cells, tolerance, and dateSystem. There are 363 cases: 61 error cases, one array case, 57 cases with input cells,
and 112 Bessel grid cases. Every function has a success case and an error case. Additional cases cover reference coercion,
error propagation, defaults, two's-complement boundaries, 48-bit values, reverse
shifts, fractional truncation, nonzero complex identities, range reductions,
array output, temperature/metric/binary conversions, extreme ERF tails, both date
systems, and a 112-case independent Bessel grid. All cases are deterministic local
calculations; none require service, host, or nondeterministic flags.

Fixtures and test contexts are original project-authored data, contributed under
the repository MIT license. Constants and identities are mathematical facts;
no proprietary workbook or cached producer results were copied. The Bessel grid
was computed independently with installed SciPy special.iv/jv/kv/yv (mathematical
outputs only; no SciPy code is vendored). Microsoft examples were used as small
semantic checks and are identified by their formulas, not copied documentation.

Primary semantics references consulted:

- [Microsoft engineering function reference](https://support.microsoft.com/en-us/excel/engineering-functions-reference)
- [CONVERT](https://support.microsoft.com/en-us/excel/functions/convert-function)
- [BITLSHIFT](https://support.microsoft.com/en-au/excel/functions/bitlshift-function)
- [BIN2HEX](https://support.microsoft.com/en-us/excel/functions/bin2hex-function)
- [DEC2BIN](https://support.microsoft.com/en-us/excel/functions/dec2bin-function)
- [BESSELI](https://support.microsoft.com/en-us/excel/functions/besseli-function), [BESSELY](https://support.microsoft.com/en-us/excel/functions/bessely-function)
- [ERF](https://support.microsoft.com/en-us/excel/functions/erf-function)
- [IMABS](https://support.microsoft.com/en-us/excel/functions/imabs-function), [IMPOWER](https://support.microsoft.com/en-us/excel/functions/impower-function), [IMPRODUCT](https://support.microsoft.com/en-us/excel/functions/improduct-function), [IMSUM](https://support.microsoft.com/en-us/excel/functions/imsum-function), [IMDIV](https://support.microsoft.com/en-us/excel/functions/imdiv-function)

## Validation

Run `bun test packages/formulas/test/engineering.test.ts`,
`bun test packages/formulas/test`, and `bunx tsc --noEmit --pretty false`.
The direct context exercises actual raw-AST registry handlers and explicit
operation exhaustion; it does not pretend to test evaluator integration.
