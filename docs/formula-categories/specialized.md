# Specialized functions: FIELDVALUE and PY

This category implements two explicit host-service adapters, not a local linked
record database or Python interpreter. Counts: **0 fully standalone names; 2
host-dependent names with implemented, tested adapters**. Missing services do not
constitute successful calculation. They call `context.unavailable`, allowing the
coordinator's evaluator to preserve producer caches and report the dependency.

## Microsoft semantics and service protocol

Primary sources (consulted 2026-11-08):

- [FIELDVALUE](https://support.microsoft.com/en-us/excel/functions/fieldvalue-function):
  two arguments; linked data fields, cell references for field names, missing
  fields produce `#FIELD!`.
- [PY](https://support.microsoft.com/en-us/excel/functions/py-function): two required
  static arguments, source text and numeric mode 0 (Excel value) or 1 (Python
  object). Python runs in Microsoft's cloud. PY cannot compose with other Excel
  functions. There is no optional return-mode default.
- [MS-XLSX Python Function](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/28f8f9b3-e370-440c-9afc-2a1bba74cde6):
  serialized PY uses a script index and can have additional script parameters.
  This differs from the public formula syntax.

The module uses only `context.services.invoke(name, values, context.address)`.
FIELDVALUE evaluates its two arguments once, propagates scalar errors, and passes
values (including rectangular arrays) unchanged. The service owns rich-record
identity, field matching, case handling, field-name coercion and broadcasting.
The adapter does not treat an ordinary display string as a real linked record.
A host can use caller identity and its retained workbook metadata to disambiguate
rich values. Unknown or unavailable records must return `undefined` if their
meaning cannot be determined; a known record with a missing field returns
`{type: "error", value: "#FIELD!"}`. A host able to determine that an argument is
not a record can likewise return `#FIELD!`.

PY validates the literal AST without evaluating arguments, then passes literal
source text and numeric mode to the host. References, computed source/mode,
string/boolean modes and modes outside 0/1 are rejected with `#VALUE!`. This is
Tumbler's deterministic validation policy for inputs Excel refuses to enter;
it is not an independently measured Excel calculation result. Valid numeric
OOXML script indices call `unavailable` pending importer script resolution.
Neither code execution nor network access is performed by this module. The
host must explicitly supply a safe authorized runtime or an external modeled
response. Errors such as `#PYTHON!`, `#CONNECT!`, and `#BLOCKED!` pass through.

Service results can be scalars or rectangular scalar arrays. Scalar errors and
array error elements are retained. Nonfinite numeric responses give `#NUM!`;
empty/ragged arrays give `#CALC!`. Arrays exceeding `maxArrayCells` and unsupported
lambda/rich-object responses call `unavailable`. Traversal charges the operation
budget; service implementations are independently responsible for bounded work.
Dates are numeric serials passed unchanged; the host owns date-system conversion.
No numeric algorithm, reference coercion or Python approximation is substituted
for the host's semantics.

## Integration dependencies and limits

Coordinator-owned work, reported before implementation:

1. Register `specializedFunctions` and pass explicit services, budgets and the
   existing `unavailable` path through the evaluator.
2. Preserve linked-record and Python-object metadata/identity. The current scalar
   union has no rich-object variant. A returned opaque scalar handle can be
   retained by a host, but is not native Excel rich-object rendering or standalone
   record support. A source display string alone cannot encode that metadata.
3. Resolve OOXML Python script parts/indices and optional captured parameters
   before invoking the public-syntax adapter. Preserve unsupported forms/caches;
   do not execute scripts during import. Extended serialized PY arity is not
   handled by this public two-argument entry point.
4. Enforce PY's root-only placement at the evaluator/importer layer. The category
   handler cannot inspect its parent expression. Report unsupported nesting
   rather than claiming Excel accepts composed PY formulas.
5. Supply authenticated linked-data/Python capabilities for external calculation
   and independently coordinate Excel oracle access. This category did not drive
   the installed Excel instance.

## Fixture inventory and provenance

`packages/formulas/test/fixtures/specialized.ts` exports 20 exact-schema cases:

- **11 `requiresService: true`, `oracle: "host"` cases:** six FIELDVALUE cases
  (price, company name, reference field name, missing field, IFERROR nesting,
  numeric date serial), and five PY cases (arithmetic, greeting, 2x2 spill,
  `xl("Inputs!A1")` read, Python exception). These are inventory entries, excluded
  from standalone success counts. The tests use a finite deterministic lookup
  model, never evaluation of Python source and never producer result caches.
- **Nine local validation/error cases:** three FIELDVALUE cases (input error,
  field-name error, arity), and six PY cases (missing mode, invalid mode,
  fractional mode, text mode, source reference, mode reference). PY validation
  cases specify `oracle: "host"` because Excel refuses nonstatic input at entry.
  They still execute locally and must not be silently skipped by integration.

Every input reference uses `Inputs!A1` or another explicit cell on Inputs; cases
are independent workbooks. Expected values use complete scalar objects or
rectangular scalar matrices. Values are exact, with no algorithmic tolerance.
Host FIELDVALUE cases need a rich linked record attached to Inputs!A1 for an
independent Excel oracle: the text `Contoso` alone is insufficient. Its modeled
fields are Price=125.5, Name="Contoso Corporation", Date=45292. Missing field
`Prices` returns `#FIELD!`. Parent generation must retain these as host-only
inventory unless it can supply the rich metadata; serializing them as ordinary
strings would not create valid Excel success tests. PY oracle generation needs
Python script parts and an enabled licensed service, not merely a formula cell.
The parent owns uncached XLSX generation, edit/reopen/preservation tests and
independent consumer verification; this module's direct tests are not that proof.

Fixtures and host records are original synthetic examples contributed under the
repository's MIT license. The greeting follows Microsoft's documented concept
with a small generic source expression; no workbook, stock quote, proprietary
record, or third-party dataset was copied. Expected results are mathematical or
synthetic model facts, not Excel-oracle captures. Category tests additionally
cover object-mode delegation, static expression rejection without evaluation,
no-service/declining-service paths, opaque objects, arrays, errors, numeric
extremes, nonfinite responses, and operation/output bounds.
