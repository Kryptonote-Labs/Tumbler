# Information functions

This category exports `informationFunctions` from
`packages/formulas/src/functions/information.ts`. It owns 15 names. Twelve names
have local implementations (including SHEET/SHEETS with workbook metadata);
CELL has local value/location behavior plus explicit host capabilities; INFO and
STOCKHISTORY require host services for successful environment/data requests.
Registration and invalid-input errors do not count as successful host support.

The 86 fixture cases in `packages/formulas/test/fixtures/information.ts` use the
shared scalar/matrix schema. 83 are local cases; three use
`requiresService: true, oracle: "host"` to identify synthetic host responses.
They cover standalone and nested calls, cross-sheet inputs, reference/literal
coercion, errors, fractional/negative/large parity inputs, blank/text/boolean
values, date serials in both date systems, and dynamic arrays. Numeric input
constants use at most 15 significant digits for portable Excel entry. Every
fixture is intended for a fresh workbook with Inputs first and Results second.
The ISFORMULA self-reference checks source formula presence without evaluating
its value. Direct tests additionally cover an omitted lexical value, all host
selectors, DATEVALUE delegation, arity, array budgets, malformed host output,
service errors, defaults, maximum date serials, and final-column addressing.

## Shared integration requirements

Register the exported map in the evaluator. Preserve raw arguments for
`context.reference`, use `context.cell` to inspect formula presence without
calculating it, and return scalar values for single-cell reads. Arrays use the
shared `kind: "array"` representation and incur operation/array budgets.

ISOMITTED recognizes exactly the forthcoming `{kind: "omitted"}` FunctionValue;
a blank worksheet cell is false. The category currently uses structural
compatibility with the announced runtime extension. The engine must preserve
omitted LAMBDA bindings rather than converting them into blank or zero. The
true omitted case is tested directly; generated LAMBDA invocation needs the
coordinator's new parser/runtime.

SHEET uses `source.sheetIndex?(sheet)` (one-based) or
`source.sheetNames?()` ordering; SHEETS() uses `source.sheetNames?()` length.
The metadata must include hidden/very-hidden worksheets and other sheet kinds.
Unknown sheet names return #N/A. Missing metadata uses `context.unavailable`,
never counts formula-bearing sheets as the workbook inventory. SHEETS of a
single-sheet reference returns one locally. Name resolution remains the
engine's `context.reference` responsibility. The current reference contract
cannot express 3-D sheet spans; these are not claimed supported here.

STOCKHISTORY text dates call `context.call("DATEVALUE", [value])`. Numeric dates
use the workbook date system, with maximum serial 2958465 (1900) or 2957003
(1904); the service receives normalized serials. No module imports another
category. Fractional serials truncate to dates. Omitted optional arguments use
Excel's defaults. Rich linked Stocks objects cannot yet be represented in the
shared scalar model; stock identifiers are text tickers, optionally MIC:ticker.

## Explicit synchronous service protocol

All requests call `context.services.invoke(name, arguments, context.address)`.
Undefined service results call `context.unavailable`, allowing engine diagnostics
and cache preservation. A supplied service must return a real FunctionValue,
including errors where appropriate; rectangular arrays are validated against
`maxArrayCells` and charged to `context.operation`. No formula performs network
I/O, arbitrary code execution, or DLL loading.

- INFO sends `[lowercaseTypeText]`. The host supplies directory, open worksheet
  count, viewport origin, OS version, calculation mode, application release, or
  environment system. Invalid keys return #VALUE! locally; obsolete memory keys
  return #N/A locally. The tests model `INFO("system")` as `"mac"`; that does not
  infer the user's platform at calculation time.
- CELL with no reference sends `[lowercaseInfoType]`; the host must use its
  active selection. CELL formatting/path queries with a reference send
  `[lowercaseInfoType, sheetIdentity, firstRow, firstColumn]`. This includes
  color, filename, format, parentheses, prefix, protect and width. The host owns
  unmapped custom Excel format codes and width's two-item result. Built-in
  format IDs 0–4 and 9–22 map locally to documented CELL format strings when
  `FormulaCellInput.numberFormatId` is available. If `numberFormatCode` is
  supplied, local color/parentheses queries inspect its unquoted, unescaped
  sections; mapped format strings include negative-red/positive-parentheses
  suffixes. Quoted or escaped literal parentheses/color words do not count. Same-sheet address is
  computed locally; cross-sheet address uses the service because saved workbook
  names/display sheet names are absent from the source contract. Row, column,
  contents (blank becomes zero), and type are computed locally. Referenced
  ranges use their upper-left cell; interactive active-cell behavior inside a
  selected range is not modeled by the headless reference API.
- STOCKHISTORY sends `[ticker, startSerial, endSerial, interval, headers,
  ...properties, dateSystemText]`. Defaults are end=start, interval=0,
  headers=1, properties=[0,1]. The service owns financial-data entitlement,
  actual trading calendars, date/period aggregation, instrument labels, headers,
  property ordering and output values. The category validates query options and
  dates before invoking it. Service output must already match the requested
  Excel table. Unit tests model a synthetic instrument XNAS:TEST with a single
  close of 123.5 on serial 45000; these are authored test data, not market data.
  No Microsoft subscription or historical feed is bundled.

## Sources and provenance

Behavior was researched from Microsoft primary documentation (accessed
2026-11-08): [CELL](https://support.microsoft.com/en-us/excel/functions/cell-function),
[INFO](https://support.microsoft.com/en-us/excel/functions/info-function),
[IS functions](https://support.microsoft.com/en-us/excel/functions/is-functions),
[ISEVEN](https://support.microsoft.com/en-us/excel/functions/iseven-function),
[ISODD](https://support.microsoft.com/en-us/excel/functions/isodd-function),
[ISFORMULA](https://support.microsoft.com/en-us/excel/functions/isformula-function),
[ISOMITTED](https://support.microsoft.com/en-us/excel/functions/isomitted-function),
[ERROR.TYPE](https://support.microsoft.com/en-us/excel/functions/error-type-function),
[N](https://support.microsoft.com/en-us/excel/functions/n-function),
[SHEET](https://support.microsoft.com/en-us/excel/functions/sheet-function),
[SHEETS](https://support.microsoft.com/en-us/excel/functions/sheets-function),
[TYPE](https://support.microsoft.com/en-au/excel/functions/type-function), and
[STOCKHISTORY](https://support.microsoft.com/en-us/excel/functions/stockhistory-function).
Fixtures and modeled responses are newly authored for this repository under its
MIT license; no Microsoft sample workbooks or proprietary financial datasets
were copied. Documentation-derived expectations are not independently observed
Excel results. Parent-managed Excel oracle, uncached XLSX documents, edit/reopen
checks and independent GPT-6.1 sol high review remain integration requirements.

## Validation

`bun test packages/formulas/test/information.test.ts`: 112 tests pass.
`bun run check`: passes. The direct harness intentionally implements only the
expression forms needed by this category's fixtures; it is not a replacement
for generated-document tests against the integrated evaluator. Excel oracle
checks requested from the coordinator include parity text/boolean coercion,
nonreference SHEETS/ISFORMULA behavior, lambda TYPE, large parity, and cross-sheet
CELL address spelling. Full linked rich-data TYPE semantics are outside the
current value contract.
