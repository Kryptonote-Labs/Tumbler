# Financial formulas

`financialFunctions` exports 55 locally calculated functions. None require a host
service, network access, DLL, cached answer, or external data connection. The
module uses only the shared runtime and category-local numerical/date helpers.

Implemented names: ACCRINT, ACCRINTM, AMORDEGRC, AMORLINC, COUPDAYBS, COUPDAYS,
COUPDAYSNC, COUPNCD, COUPNUM, COUPPCD, CUMIPMT, CUMPRINC, DB, DDB, DISC,
DOLLARDE, DOLLARFR, DURATION, EFFECT, FV, FVSCHEDULE, INTRATE, IPMT, IRR, ISPMT,
MDURATION, MIRR, NOMINAL, NPER, NPV, ODDFPRICE, ODDFYIELD, ODDLPRICE, ODDLYIELD,
PDURATION, PMT, PPMT, PRICE, PRICEDISC, PRICEMAT, PV, RATE, RECEIVED, RRI, SLN,
SYD, TBILLEQ, TBILLPRICE, TBILLYIELD, VDB, XIRR, XNPV, YIELD, YIELDDISC, YIELDMAT.

## Semantics and implementation

Annuities use signed cash flows, end/beginning payment types, zero-rate limits,
and `log1p`/`expm1` for small interest rates. Interest and principal components
share the annuity equations. Cumulative payments charge the context operation
budget per period. Depreciation includes rounded DB rates, first/last partial
DB years, DDB caps, VDB fractional periods and straight-line switching, and
prorated French depreciation. AMORDEGRC is a legacy compatibility function;
Microsoft now deprecates it.

Coupon calendars are anchored to maturity/first/last coupon, preserve month ends,
and truncate date/frequency/basis inputs. The five bases are NASD 30/360,
actual/actual, actual/360, actual/365, and European 30/360. Date serials respect
`context.dateSystem`, including serial 60 in the 1900 system. Odd coupons use
fractional quasi-coupon periods. PRICE has Excel's separate one-period simple
interest equation; longer bonds discount individual coupons. DURATION weights
discounted cash flows; MDURATION divides by the periodic yield factor.

Root searches use bounded Newton iterations in log(1+rate), then bounded
bracketing/bisection. RATE and IRR normalize cash flows to avoid treating tiny
currency values as convergence. Numerical overflow returns #NUM! through the
shared finite-number helper. Evaluation-budget exceptions propagate to the
engine rather than becoming numeric errors. All variable-length loops charge
`context.operation`; cash-flow input allocation respects `maxArrayCells`.

NPV/IRR/MIRR ignore nonnumeric array/reference entries and propagate cell errors;
NPV accepts coercible scalar literal arguments. FVSCHEDULE accepts numeric rates
and blanks, with other schedule types returning #VALUE!. XNPV/XIRR validate
matching vectors, truncate dates, reject dates before the first date, and use
365-day exponents even in leap years. Scalar numeric arguments use the shared
coercion helper. An announced `{kind:'omitted'}` context value selects optional
defaults; required numeric omissions become zero. ACCRINT's omitted par defaults
to 1000. Direct tests inject omitted values until the coordinator merges parser
and runtime support.

## Primary sources and provenance

Semantics are based on Microsoft's [financial function reference](https://support.microsoft.com/en-us/excel/financial-functions-reference)
and its individual function pages. In particular:

- [PRICE](https://support.microsoft.com/en-us/excel/functions/price-function), [YIELD](https://support.microsoft.com/en-us/excel/functions/yield-function), [DURATION](https://support.microsoft.com/en-us/excel/functions/duration-function).
- [ODDFPRICE](https://support.microsoft.com/en-us/excel/functions/oddfprice-function), [ODDFYIELD](https://support.microsoft.com/en-us/excel/functions/oddfyield-function), [ODDLPRICE](https://support.microsoft.com/en-us/excel/functions/oddlprice-function).
- [ACCRINT](https://support.microsoft.com/en-us/excel/functions/accrint-function), [ACCRINTM](https://support.microsoft.com/en-us/excel/functions/accrintm-function).
- [AMORDEGRC](https://support.microsoft.com/en-us/excel/functions/amordegrc-function), [AMORLINC](https://support.microsoft.com/en-us/excel/functions/amorlinc-function), [VDB](https://support.microsoft.com/en-us/excel/functions/vdb-function).
- [IRR](https://support.microsoft.com/en-us/excel/functions/irr-function), [RATE](https://support.microsoft.com/en-us/excel/functions/rate-function), [XNPV](https://support.microsoft.com/en-us/excel/functions/xnpv-function), [FVSCHEDULE](https://support.microsoft.com/en-us/excel/functions/fvschedule-function), [RRI](https://support.microsoft.com/en-us/excel/functions/rri-function).

Fixtures and implementation are original repository code under the repository's
MIT license. Expectations are independently derived from financial equations,
exact zero-rate identities, and hand-selected domain violations; they are not
captured Excel caches and do not constitute an independent Excel oracle. The
AMORDEGRC sample's numerical inputs and 776 result follow Microsoft's published
example, attributed above; no documentation prose or third-party source code is
vendored. Dates use literal serials so generated workbooks do not depend on the
date category. All input references explicitly target Inputs sheet. Each case
can be emitted as its own uncached Results/Inputs XLSX workbook.

## Fixture inventory and verification

The fixture module exports 147 `cases` with full scalar expectations (87 numeric,
60 errors). The financial tests contain 159 passing tests; the complete formula
test directory contains 198 passing tests. Every name has
a numeric success and domain/error case (110 baseline cases). Additional cases
cover nesting, editable referenced loan inputs, literal/reference coercion,
propagated errors, negative dollar values, tiny rates, annuity-due payments,
partial depreciation, leap coupons, both date systems, the phantom leap day,
zero/negative bond yields, all five day-count bases, cumulative interest,
negative/tiny-cashflow IRR, blank schedules, and invalid XIRR vector lengths.
None are marked requiresService or nondeterministic, because all results are
local and deterministic. Direct tests also exercise argument counts and error
propagation for every handler, array geometry, budgets, omitted values,
unsorted XNPV dates, and amortization identities.

Run `bun test packages/formulas/test` and `bun run check`.

## Integration dependencies and limitations

The coordinator must register `financialFunctions` and merge omitted-argument
parser/runtime support. No shared engine files are changed here. Cross-category
function implementations are not imported. No additional engine capability is
required by these handlers.

Scalar handlers currently reject matrix arguments rather than implementing
Excel dynamic-array broadcasting; cash-flow functions accept rectangular
matrices. Root selection for multiple-root cash flows and convergence/failure
boundaries can differ from Excel's proprietary iteration and stopping rules.
The numerical search covers rates greater than -1; extremely negative periodic
bond yields outside that search domain are not supported. Unusual long odd
coupons, month-end day-count interactions, legacy AMORDEGRC terminal periods,
and fractional DDB periods still need independent Excel oracle coverage before
claiming comprehensive behavioral parity.

Generated XLSX calculation/edit/reopen/preservation checks and the independent
GPT-6.1 sol high reviews belong to the coordinator's integrated pass. They have
not been run in this category worktree, and this category commit does not declare
the integrated project ready.

## Independent review follow-up

RATE trial residuals now scale individual cash-flow terms in log space. RATE uses a bounded twenty-step Newton search and rejects nonconvergence without a bracket fallback. Native Excel returns #NUM! for RATE(1000,0,-1,1e-100) despite a mathematical root, and for RATE(1000,0,-1,0); both are explicit oracle fixtures. Other financial solvers retain bounded bracketing with direct sign comparison and require a validated residual instead of accepting bracket width alone.
