# Datetime formula category

`packages/formulas/src/functions/datetime.ts` exports `datetimeFunctions`.
All 14 scoped names have numeric/string calculation implementations:
DATEDIF, DAYS360, HOUR, ISOWEEKNUM, MINUTE, NETWORKDAYS.INTL, NOW, SECOND,
TIME, TIMEVALUE, TODAY, WEEKNUM, WORKDAY.INTL, YEARFRAC.
There are zero service-dependent names, cache fallbacks, or network operations.
NOW and TODAY require the calculation context's stable injected clock.

## Integration contract

Register this map in the shared evaluator. Supply `context.dateSystem`, stable
`context.now()`, `context.operation()`, and `context.maxArrayCells`. No shared
runtime changes are required by this module. The coordinator's announced
`{kind:'omitted'}` values are recognized structurally, so optional weekend,
week-start, method and basis arguments retain their defaults. The old checked-in
runtime does not yet declare that union variant. The local test context supports
nested calls through `context.call`; this module has no cross-category imports.

Array arguments broadcast scalars, single rows and single columns into a
rectangular result. The holiday argument is a single set rather than a broadcast
argument; duplicate holidays and holidays on weekends do not subtract twice.
Incompatible argument dimensions return #N/A. Array sizes and holiday-set sizes
are checked against maxArrayCells, and loops charge the operation budget.
NETWORKDAYS.INTL counts full weeks and at most six residual days, plus holidays.
WORKDAY.INTL uses binary search over the valid date domain (at most 22 steps),
counting workdays in each interval; it never loops over an arbitrary day offset.

Both 1900 and 1904 date systems are supported through December 31, 9999.
The 1900 system includes serial 60 (the fictitious February 29), serial zero,
and Excel's pre-March weekday convention. Numeric date arguments truncate their
time component; negative and out-of-range serials return #NUM!. TIME truncates
components, carries minutes/seconds, wraps whole days and rejects component
upper overflow or a negative total. HOUR/MINUTE/SECOND round the fractional day
to whole seconds before extracting a component. WEEKNUM implements all documented
return types; ISOWEEKNUM uses the Thursday rule. YEARFRAC supports all five bases,
positive reversed-date intervals, and actual-year average denominators.

## Text and clock limits

Text parsing is deterministic, with no JavaScript Date.parse fallback or
machine-locale guessing. Supported date text is YYYY-MM-DD, YYYY/MM/DD,
MM/DD/YYYY, and DD-Mmm-YYYY with English three-letter months. Supported time text
is H:mm[:ss[.fraction]], 12-hour AM/PM (including `12 PM`), and those date forms
followed by a time. Date-only text is also accepted by component extractors.
Other localized Excel date/time forms, two-digit years and localized AM/PM names
are not implemented. Invalid date prefixes return #VALUE! rather than being
silently discarded. Text and numeric references use the same scalar coercion as
literal arguments; empty references coerce to zero for numeric arguments.

NOW/TODAY use the injected Date's local calendar fields, matching the host's
calendar timezone. The three fixed-clock fixtures use ISO local-time strings
without offsets to express that choice. They are explicitly marked
`oracle: 'nondeterministic'` because native Excel cannot use the injected clock.
Stable-clock subtraction fixtures exercise both functions without a wall-clock
expected value. These are ordinary local implementations, not host services.

Microsoft documents historical DATEDIF MD issues and YEARFRAC US-basis February
issues. The module implements MD with previous-month borrowing and separate
US-basis February adjustments for YEARFRAC; it does not claim that all historical
Excel-version anomalies have been independently verified. Excel oracle checks
for fractional-second rounding, February DAYS360 endpoints and DATEDIF MD leap
boundaries have been requested from the coordinator. Native Excel is not driven
from this worktree. Integrated generated-document/oracle results and independent
GPT-6.1 sol high reviews are still required before overall readiness.

## Fixture inventory and provenance

`packages/formulas/test/fixtures/datetime.ts` exports the exact shared `cases`
schema: unique name, formula without equals, full scalar or rectangular scalar
matrix expectation, optional Inputs-sheet A1-keyed cells, dateSystem, now and
oracle metadata. Every reference in a formula explicitly names Inputs. Cases
contain no producer caches or serialized workbook data; each can be materialized
as its own uncached Inputs/Results XLSX by the coordinator.

The inventory covers all names with standalone, nested, default, valid boundary,
error and reference cases. It includes all DATEDIF units, all YEARFRAC bases,
custom and numeric weekends, duplicate/blank/error holidays, reversed intervals,
1900 leap-day compatibility, 1904 dates, maximum dates and huge offsets, boolean,
blank and text coercion, reference-array spill, clock arity and fixed clocks.
Additional direct tests check argument arity, error propagation, all weekend
codes, array budgets, omitted defaults, full-domain bounded work and business-day
inverse relationships in both date systems.

The fixtures and algorithms are original project contributions under the
repository's MIT license. Expected values were independently constructed using
calendar arithmetic and the documented semantics below. They are not copied
workbooks and are not claimed to be recorded native-Excel outputs. Microsoft's
examples were consulted as semantic cross-checks; no documentation prose or
third-party fixture corpus is redistributed.

## Microsoft primary references

- [DATEDIF](https://support.microsoft.com/en-us/excel/functions/datedif-function)
- [DAYS360](https://support.microsoft.com/en-us/excel/functions/days360-function)
- [HOUR](https://support.microsoft.com/en-us/excel/functions/hour-function)
- [ISOWEEKNUM](https://support.microsoft.com/en-us/excel/functions/isoweeknum-function)
- [MINUTE](https://support.microsoft.com/en-us/excel/functions/minute-function)
- [NETWORKDAYS.INTL](https://support.microsoft.com/en-us/excel/functions/networkdays-intl-function)
- [NOW](https://support.microsoft.com/en-us/excel/functions/now-function)
- [SECOND](https://support.microsoft.com/en-us/excel/functions/second-function)
- [TIME](https://support.microsoft.com/en-us/excel/functions/time-function)
- [TIMEVALUE](https://support.microsoft.com/en-us/excel/functions/timevalue-function)
- [TODAY](https://support.microsoft.com/en-us/excel/functions/today-function)
- [WEEKNUM](https://support.microsoft.com/en-us/excel/functions/weeknum-function)
- [WORKDAY.INTL](https://support.microsoft.com/en-us/excel/functions/workday-intl-function)
- [YEARFRAC](https://support.microsoft.com/en-us/excel/functions/yearfrac-function)
