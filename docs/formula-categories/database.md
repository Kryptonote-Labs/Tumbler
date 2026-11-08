# Database formulas

The category module exports `databaseFunctions: FunctionRegistry` with real local
implementations of DAVERAGE, DCOUNT, DCOUNTA, DGET, DMAX, DMIN, DPRODUCT, DSTDEV,
DSTDEVP, DSUM, DVAR, and DVARP. All twelve implement standard field criteria;
none require host services. This category is not an integration-readiness claim.

Database and criteria arguments are rectangular references obtained through
`context.reference` and `context.readReference`; each includes a header and at
least one subsequent row. Fields can be one-based numeric column positions or
case-insensitive header labels, including a field supplied by a cell reference.
DCOUNT and DCOUNTA support a blank field and the integrated runtime's
`{kind:"omitted"}` value to count matching records. Other functions require a
valid field. Scalar and array values without reference geometry are rejected.

Criteria columns combine with AND, criteria rows with OR. Duplicate column labels
allow lower and upper bounds on one field. A matched record is aggregated once.
Blank criteria impose no restriction. Text matching supports case-insensitive
prefixes, explicit equality, comparisons, `*`, `?`, and `~` wildcard escapes.
Numeric criteria compare numeric cells (and blanks as zero), without converting
text or Boolean field values into numbers. Numeric aggregates ignore text,
Boolean values and blank cells. Matching field errors propagate, except DCOUNT
ignores them and DCOUNTA counts them. DCOUNTA counts empty strings as values.
DGET retains the selected scalar type, converts a selected blank to zero, and
returns #VALUE! for no records or #NUM! for multiple records.

DSUM, DCOUNT, DCOUNTA, DMIN, DMAX and DPRODUCT return zero for no numeric/matching
values, as applicable. DAVERAGE requires one numeric value. Sample variance and
standard deviation require two numeric values; population versions require one.
Insufficient observations return #DIV/0!. Nonfinite numeric outputs return #NUM!.
Sums and means use scaled compensated summation. Variance shifts observations
before scaling to retain small spreads at large offsets. Standard deviation is
computed without forming an overflowing intermediate variance. Product uses
bounded sequential IEEE-754 multiplication and reports intermediate overflow;
it does not promise order-independent products across intermediate overflow or
underflow. Every traversal and wildcard retry charges `context.operation`;
reference materialization checks `maxArrayCells` before reading cells.

## Integration dependencies and limitations

- Register the category map in the coordinator-owned runtime.
- Preserve omitted AST arguments as `{kind:"omitted"}` values for actual
  `DCOUNT(database,,criteria)` / `DCOUNTA(database,,criteria)` formulas.
- Formula criteria under blank/nonmatching headers need an engine facility to
  re-evaluate the criteria cell with translated relative row references for each
  database record. The current shared contract cannot express this. These cases
  call `context.unavailable` so the engine can preserve producer caches honestly.
  Constant Boolean criteria without formulas work. No synthetic host service
  adapter is used to conceal this missing evaluation capability.
- Locale-sensitive date/currency strings in criteria are not parsed. Date cells
  and numeric serial criteria work unchanged in either workbook date system;
  these functions do not themselves convert dates.
- Locale-specific collation, Unicode wildcard character boundaries beyond UTF-16,
  and Excel-specific subnormal flushing are not certified. Fractional field
  positions currently truncate. These edge semantics need Excel oracle checks.
- Direct tests use a category-local context. Only that harness substitutes an
  empty input reference while parsing comma gaps against the initial parser;
  exported corpus formulas retain their actual `,,` syntax. Local test success
  does not establish evaluator/XLSX integration or independent Excel agreement.

## Fixtures and verification

`packages/formulas/test/fixtures/database.ts` exports **66** deterministic cases
using the shared `name`, `formula`, scalar `expected`, and A1-keyed `cells` schema,
with optional `dateSystem` and numeric `tolerance`. Inputs are referenced using
`Inputs!A1`-style sheet references. Each fixture is self-contained, requires no
host service, clock, RNG, cached result, or network. There are no host-only or
nondeterministic cases needing schema flags.

Inventory: success, no-record and invalid-field cases for each aggregate;
unique/no-record/multiple/blank/error DGET; matching field errors for all names;
AND bounds, OR deduplication, prefixes, escaped wildcards, blank criteria;
omitted fields; referenced field selectors; nested arithmetic; average, sum,
product and variance overflow; stable large-offset and tiny variance; finite
extreme standard deviation; numeric serial date ranges in 1900/1904 systems.
The coordinator generates actual uncached XLSX documents from this inventory and
owns edit, reopen, preservation and Excel/independent-consumer verification.

The category test suite additionally covers arity and reference validation for
every name, matching versus nonmatching errors, Boolean/text/blank coercion,
constant computed criteria, explicit unavailable diagnostics for formula
criteria, singleton statistics, empty numeric fields, and allocation/operation
budget exhaustion including hostile wildcard patterns. At category completion:
`bun test packages/formulas/test/database.test.ts` passes 97 tests;
`bun run check` passes. No Excel automation was run by this category thread.

All fixture data and expected-value derivations are original synthetic examples
created for Tumbler and distributed under the repository MIT license. Expected
values were calculated analytically, not taken from Excel caches or copied from
Microsoft's example tables. The primary references below guide semantics; they
are not a redistribution license for Microsoft documentation. Fixtures should
be independently verified by the coordinator's Excel oracle before readiness.

## Microsoft primary references

- [DAVERAGE and database criteria rules](https://support.microsoft.com/en-us/excel/functions/daverage-function)
- [DCOUNT](https://support.microsoft.com/en-us/excel/functions/dcount-function), [DCOUNTA](https://support.microsoft.com/en-us/excel/functions/dcounta-function), [DGET](https://support.microsoft.com/en-us/excel/functions/dget-function)
- [DMAX](https://support.microsoft.com/en-us/excel/functions/dmax-function), [DMIN](https://support.microsoft.com/en-us/excel/functions/dmin-function), [DPRODUCT](https://support.microsoft.com/en-us/excel/functions/dproduct-function), [DSUM](https://support.microsoft.com/en-us/excel/functions/dsum-function)
- [DSTDEV](https://support.microsoft.com/en-us/excel/functions/dstdev-function), [DSTDEVP](https://support.microsoft.com/en-us/excel/functions/dstdevp-function), [DVAR](https://support.microsoft.com/en-us/excel/functions/dvar-function), [DVARP](https://support.microsoft.com/en-us/excel/functions/dvarp-function)
