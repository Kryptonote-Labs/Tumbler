# Automation formulas

This category exports `automationFunctions` from
`packages/formulas/src/functions/automation.ts`. It implements one local
function, EUROCONVERT, and two explicit host-dependent functions, CALL and
REGISTER.ID. Host-dependent successes are not counted as local support.

## Sources and provenance

Primary specifications:

- [Microsoft EUROCONVERT](https://support.microsoft.com/en-us/excel/functions/euroconvert-function):
  syntax, supported currencies, rounding table, restrictions, and four worked
  examples.
- [Microsoft CALL](https://support.microsoft.com/en-us/excel/functions/call-function):
  ID and resource invocation forms; macro-sheet restriction.
- [Microsoft REGISTER.ID](https://support.microsoft.com/en-us/excel/functions/register-id-function):
  named and ordinal procedures, optional type information for registered resources.
- [Microsoft CALL/REGISTER data types](https://support.microsoft.com/en-us/excel/using-the-call-and-register-functions):
  host signature/marshalling responsibilities, including array/error arguments.
- [ECB fixed rates](https://www.ecb.europa.eu/euro/intro/html/index.en.html):
  independently published irrevocable conversion constants.

The code, fixture formulas, and modeled adapter are original work under the
repository MIT license. The four fixtures named “Microsoft:” reproduce the
numeric examples from Microsoft; other expected values are independently
derived arithmetic or explicit deterministic host-model outcomes. No workbook
or external test corpus was copied. These fixtures have not yet been verified
against installed desktop Excel.

## EUROCONVERT behavior

The fourteen Microsoft-documented codes are accepted case-insensitively:
EUR, ATS, BEF, DEM, ESP, FIM, FRF, IEP, ITL, LUF, NLG, PTE, GRD, SIT.
Rates are fixed constants; the implementation performs no network access and
does not imply support for every modern euro member's former currency.

Three to five arguments are accepted. Full precision defaults to false;
triangulation defaults to no intermediate rounding. Explicit shared omitted
values use those defaults, while omitted required arguments are errors. Same-currency conversion
returns the original amount. Numeric text, booleans, and blank amount cells
use the shared numeric coercion helper; currency arguments must be strings.
Errors propagate. Arrays are rejected, as Microsoft's documentation explicitly
excludes array formulas. Dates are just numeric serial amounts and the workbook
date system does not change conversion.

Conversion divides by the source's units-per-euro and multiplies by the target's.
For non-EUR sources, supplied triangulation precision rounds the intermediate
euro amount before multiplication. Final rounding uses the documented target
calculation precision unless full precision is enabled. Rounding is symmetric,
half away from zero. Constant-work decimal shifting avoids multiplication
overflow when rounding large finite values; nonfinite conversion results
produce #NUM!. No loop or allocation depends on the requested precision.

Oracle follow-ups sent to the coordinator: Microsoft's prose calls triangulation
precision “significant digits,” whereas its examples and legacy Euro Currency
Tools behavior indicate decimal places. This implementation uses decimal places,
truncates fractional precision to an integer, requires at least three, and leaves
double values unchanged when requested precision exceeds double resolution.
PTE and GRD use the documented calculation precision of zero despite their
display precision of two; no number formatting is applied. These details and
lowercase/coercion behavior require desktop oracle confirmation before parity
readiness. No oracle access was attempted concurrently with the coordinator.

## Explicit automation host

The existing runtime contract is sufficient:

```ts
context.services?.invoke("REGISTER.ID", evaluatedArguments, context.address)
context.services?.invoke("CALL", evaluatedArguments, context.address)
```

REGISTER.ID validates two or three scalar header arguments. Module and type
information must be nonempty strings; a procedure can be a nonempty name or
positive integral ordinal. CALL accepts a positive numeric registered ID and
arguments, or module/procedure/type information and arguments. The two-argument
module/procedure form is passed to the host for standalone XLL resources with
omitted type information. Header errors propagate before host invocation.
Typed procedure arguments, including P-type arrays/errors and the shared
{kind: "omitted"} marker, are passed intact. An omitted REGISTER.ID type
argument is treated as absent; CALL can forward an omitted type to an XLL host.
Lambdas are rejected. Array inputs and outputs honor operation/cell budgets;
ragged outputs are rejected and nonfinite numeric outputs return #NUM!.

The host owns allowlisting, macro-sheet authorization, existing registration
state, type-code validation, ordinal/resource interpretation, native argument
marshalling and platform distinctions. The category never loads DLLs, invokes
arbitrary code, or performs implicit IO. The adapter is synchronous and should
enforce its own work limits. An absent adapter or an undefined adapter response
calls `context.unavailable`, preserving producer caches through evaluator
integration. Adapter errors are returned as errors; exceptions are not swallowed.

CALL is documented as macro-sheet-only. Success on an ordinary Results worksheet
is an explicit Tumbler host model, not a claim that Excel executes CALL there.
Macro-sheet OOXML support is outside this category. REGISTER.ID also needs an
available compatible resource and may be restricted by Excel security policy.

## Fixtures and integration

`packages/formulas/test/fixtures/automation.ts` exports 48 cases using the shared
schema. References use `Inputs!A1`; each case is suitable for its own uncached
Inputs/Results workbook. Inventory: 30 EUROCONVERT cases (four published examples,
references/coercion, nested invoice conversions, defaults, rounding, errors,
overflow/extremes, and a 1904 case), six invalid CALL/REGISTER.ID cases, and twelve
modeled host cases (registration, direct/ID/nested/reference calls, unknown
resource/ID, signature/type errors, overflow).

All CALL and REGISTER.ID cases carry `oracle: "host"` because desktop worksheet
and native-resource policy differ. The twelve adapter-dependent cases also carry
`requiresService: true`. The six invalid-header cases are locally deterministic
without an adapter, but must not be compared to ordinary Excel worksheet CALL
results.

For the twelve host cases, the generated-document harness must explicitly inject
the exported `modeledAutomationServices`. That adapter recognizes only the
fictional Demo.Scale resource (or ordinal 1), uses stable registration ID 42,
requires signature BB, and doubles one numeric input. Its results are modeled,
not captured native DLL results. Missing-host tests live in the direct module
tests because expected cache preservation is an evaluator diagnostic rather
than an ordinary scalar Excel result.

Coordinator integration dependencies: add this registry to function dispatch;
supply context evaluation/reference values, service injection, unavailable cache
preservation, and operation/array limits from the shared contract. No shared
runtime files or package manifests were changed. Generated XLSX roundtrips and
independent GPT-6.1 sol high reviews remain coordinator-owned requirements.
