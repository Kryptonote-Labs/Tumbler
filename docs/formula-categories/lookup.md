# Lookup and reference formula category

`packages/formulas/src/functions/lookup.ts` exports `lookupFunctions` and owns
33 names. Thirty have local implementations; GETPIVOTDATA, RTD, and IMAGE require
an explicit synchronous host adapter. This is category implementation evidence,
not a claim of complete Excel parity or integrated readiness.

## Semantics and sources

Implementation follows Microsoft's [lookup/reference index](https://support.microsoft.com/en-us/excel/lookup-and-reference-functions-reference)
and linked function pages. Particularly relevant primary references:

- [ADDRESS](https://support.microsoft.com/en-us/excel/functions/address-function): absolute/relative styles, worksheet bounds, quoted sheet names.
- [INDIRECT](https://support.microsoft.com/en-us/excel/functions/indirect-function), [OFFSET](https://support.microsoft.com/en-us/excel/functions/offset-function), [FORMULATEXT](https://support.microsoft.com/en-us/excel/functions/formulatext-function): reference geometry, text references, source formula inspection.
- [LOOKUP](https://support.microsoft.com/en-us/excel/functions/lookup-function): approximate vector search and array orientation; sorted inputs are the documented precondition.
- [FILTER](https://support.microsoft.com/en-us/excel/functions/filter-function), [TAKE](https://support.microsoft.com/en-us/excel/functions/take-function), [TOCOL](https://support.microsoft.com/en-us/excel/functions/tocol-function), [UNIQUE](https://support.microsoft.com/en-us/excel/functions/unique-function): spill dimensions, empty results, scan direction, blank/error filtering, uniqueness.
- [TRIMRANGE](https://support.microsoft.com/en-au/excel/functions/trimrange-function): leading/trailing blank trimming modes.
- [GROUPBY](https://support.microsoft.com/en-us/excel/functions/groupby-function), [PIVOTBY](https://support.microsoft.com/en-us/excel/functions/pivotby-function): grouping, scalar aggregation lambdas, filtering, sorting, headers, and grand totals.
- [GETPIVOTDATA](https://support.microsoft.com/en-us/excel/functions/getpivotdata-function), [RTD](https://support.microsoft.com/en-us/excel/functions/rtd-function), [IMAGE](https://support.microsoft.com/en-us/excel/functions/image-function): external capabilities and argument validation.

## Implemented behavior

ADDRESS supports A1/R1C1 styles and numeric coercion. ROW/COLUMN return geometry
arrays; ROWS/COLUMNS count reference dimensions without reading the range.
AREAS handles one contiguous reference. FORMULATEXT reads the upper-left source
formula, retaining the leading equals sign. INDIRECT parses bounded A1 and R1C1
references, relative coordinates, escaped sheet names, and reversed endpoints;
workbook-defined names use the announced optional `source.resolveName` hook.
OFFSET reads bounded offset geometry. HYPERLINK returns its display label or
location without navigation or network activity.

CHOOSECOLS/CHOOSEROWS select repeated, positive, or negative indices.
TAKE/DROP slice signed dimensions, including omitted row counts. EXPAND pads to
larger dimensions. HSTACK/VSTACK pad unequal shapes with #N/A. TOCOL/TOROW support
row/column scans and blank/error exclusion. WRAPCOLS/WRAPROWS reshape vectors with
custom padding. FILTER supports either axis and an empty fallback. TRANSPOSE,
SORT, SORTBY, UNIQUE, and TRIMRANGE preserve typed cell data, with blank output
cells represented as Excel's numeric zero. Dates pass through as serial numbers
under either date system, without unnecessary calendar conversion.

GROUPBY supports one grouping field, multiple value columns, a scalar aggregation
lambda, header detection/selection, sorting by field or aggregate, a Boolean row
filter, and grand totals above or below. PIVOTBY supports one row field, one
column field, one value column, a scalar lambda, sorting, filtering, and grand
totals on either axis. Other-category aggregation uses the provided lambda and
therefore `context.call` from the lambda's owning runtime, never a category import.

Allocations check `maxArrayCells`; loops and sorting charge `context.operation`.
Configured budget exhaustion uses `context.unavailable`, while worksheet-size
overflow and empty arrays produce Excel errors. No catch swallows runtime budget
exceptions. Selection-index accumulation is bounded before allocating its output.

## Host adapter contract

All three services call `context.services.invoke(name, arguments, context.address)`.
Undefined responses or absent adapters call `context.unavailable`, allowing the
coordinator's evaluator to preserve producer caches without counting them as
calculation support. Adapters can return typed errors as meaningful responses.
The module never loads COM servers, DLLs, runs code, fetches URLs, or navigates.

- GETPIVOTDATA validates field/item pairs. Argument 1 (zero-based) is replaced by
  the canonical descriptor `sheet!RfirstCfirst:RlastClast`, including a repeated
  endpoint for single cells. Remaining arguments preserve their typed values.
  The adapter owns pivot metadata, field/item resolution, visibility, and totals.
  Sheet identity is source-owned; consumers must not split on an arbitrary `!`
  without accounting for the complete descriptor. The modeled test asserts the
  exact `Inputs!R1C1:R1C1` descriptor.
- RTD supplies the ProgID, server, and topic values. An omitted server is an empty
  string. A host must provide an explicitly configured data source; installing a
  COM server is an Excel requirement, not work performed by the formula engine.
- IMAGE validates HTTPS sources, text arguments, sizing, and positive custom
  dimensions (one specified dimension preserves aspect ratio). A host must own
  image acquisition, permissions, format checks, and rendering. With no rich image
  value in the shared scalar contract, the modeled response is an accessible
  string, `[image: Product]`; it is not claimed to be a native Excel image value.

## Integration requirements and limitations

The coordinator must register the map, implement arrays/spills and omitted values
(`{kind:'omitted'}`), invoke lambdas/named aggregates, expose source formulas, and
preserve reference geometry through nested reference-producing calls. This branch
only returns values from OFFSET/INDIRECT; the evaluator's `context.reference`
resolver must understand those calls when used by ROW/AREAS/FORMULATEXT/etc.
Dynamic references must participate in dependency tracking and invalidation.

The existing reference contract describes only one rectangular area. Consequently,
union/3-D AREAS calls need a multi-area runtime extension; they are not counted as
supported here. INDIRECT external workbooks remain explicitly unavailable;
workbook-defined names require `source.resolveName`. Full-row/column INDIRECT
text, structured references, and array broadcasting of scalar address arguments
are not implemented. HYPERLINK computes a label, without hyperlink relationship
metadata (there is no shared rich-value metadata hook).

GROUPBY/PIVOTBY hierarchical subtotals, multi-field groups, multi-value pivots,
arrays of aggregation lambdas, vector sort selectors, and relative two-argument
aggregations are outside this implementation. Hierarchical layouts and relative
aggregation call `unavailable`; unsupported lambda/selector shapes return typed
argument errors. They must not be counted as full-function parity. Automatically
generated header labels and PIVOTBY header presentation still require the parent’s
Excel oracle comparison. Sorting uses deterministic case-insensitive lexical
ordering rather than Excel's locale-specific collation; extreme subnormal serials
are retained as JS numbers rather than emulating Excel's floating-point flushing.

No independent Excel oracle was driven from this worktree. Integrated generated
XLSX verification and independent GPT-6.1 sol high reviews belong to the coordinator.

## Fixtures, provenance, and validation

`packages/formulas/test/fixtures/lookup.ts` exports exact-schema `cases`, with scalar
objects or rectangular scalar matrices, and A1-keyed input cells on Inputs sheet.
One FORMULATEXT success intentionally inspects Results!A1's own formula text; that
metadata read does not evaluate the cell recursively. Each case must have its own
Inputs/Results workbook. Date-system flags cover both epochs.

There are 185 cases: 182 local expectations and 3 explicitly marked
`requiresService:true, oracle:'host'` modeled successes. Cases cover all 33 names,
valid/default/omitted inputs, typed errors, coercion, dimension mismatches,
worksheet boundaries, nested formulas, dates, and realistic sales grouping. Eighty
of the cases independently generate expected permutation/reshape results for 20
small rectangular shapes. They do not import implementation helpers. Host cases
remain in inventory and must be excluded from local success counts, never silently
presented as independently recalculated Excel outputs.

Fixtures and expectations are newly authored for Tumbler, licensed under the
repository's MIT license. They are derived from documented behavior, not copied
Microsoft workbooks or scraped proprietary data. Microsoft pages are semantics
references, not a fixture license grant or evidence of actual Excel execution.

The category-local test context uses the real parser for supported syntax and
substitutes injected contract lambda/omitted values where the baseline parser
cannot yet parse them. This substitution is test-only; fixtures retain real Excel
formula syntax for the parent's uncached-XLSX harness. Direct tests additionally
exercise FORMULATEXT length limits, service absence/decline/errors, budget aborts,
name resolution, argument counts, custom IMAGE sizing, and reference coercion.
