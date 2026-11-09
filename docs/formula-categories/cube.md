# Cube functions

`packages/formulas/src/functions/cube.ts` exports `cubeFunctions` with all seven
Excel cube names. Status: **7 implemented service bridges / 7 host-dependent;
0 standalone OLAP engines**. No cache fallback is counted as successful support.
The module has no network, DLL, code execution, or Excel automation dependency.

## Contract and integration

Each handler checks arity, evaluates raw arguments with `context.evaluate`, charges
`context.operation`, propagates scalar/array errors, bounds array inputs by
`context.maxArrayCells`, then calls exactly:

```ts
context.services.invoke(name, evaluatedValues, context.address)
```

The function name is uppercase. Optional arguments remain omitted; arguments are
not pre-coerced or flattened, so services can distinguish tuples and caption
identity. Explicit `{kind: "omitted"}` values are forwarded intact; the snapshot
adapter treats omitted optional captions/sort arguments as defaults. Services own connection lookup, MDX validation, session lifetimes,
connection-specific collation, KPI properties, rank/sort coercion, measure defaults,
and aggregation. `undefined` or absent services cause `context.unavailable`,
preserving producer caches through the shared runtime rather than claiming success.
A host may return `#NAME?` for an explicitly known invalid/unavailable connection;
absence of a host is not evidence that a workbook connection is invalid.
The bridge normalizes nonfinite numeric results to `#NUM!` and CUBEVALUE blank
(database NULL) results to empty strings. Cube functions return scalars.

CUBEMEMBER and CUBESET reject literal MDX longer than 255 UTF-16 code units;
references permit longer expressions. Cross-formula expressions and exact Excel
error precedence in the presence of multiple independent faults need oracle
qualification. Literal/reference coercion is passed intact to the host otherwise.
Date serials are not interpreted by this category; supplied cube values are
independent of the workbook's 1900/1904 system.

The coordinator must register `cubeFunctions`, expose services in calculation
options, and preserve cube identity metadata through nested calls, cell references,
and reopening XLSX. Excel stores MDX identity independently of the displayed
caption. The current scalar value contract cannot serialize this metadata. Announced
source hooks (sheetNames/sheetIndex/usedDimensions/resolveName) do not add cube
identity metadata and are not required by this module.
Hosts must reconstruct it from workbook/source cube metadata or retain result
object identity within a calculation. Comparing caption strings is incorrect.
`context.reference` is not needed by this bridge: ranges are evaluated as arrays;
services needing original reference geometry can capture workbook source/formulas
using the supplied formula address. No alternative runtime contract is introduced.

## Explicit offline snapshot adapter

`createCubeSnapshotServices(connections, { operation, maxArrayCells })` is a usable,
finite, synchronous implementation of `FormulaFunctionServices`. Inputs:

- Named connection snapshots, each containing exact MDX member identities and
  captions, optional scalar properties and numeric measure sort keys.
- Exact named/MDX set expressions mapped to ordered member identity lists.
- KPI names mapped to six member identities in value/goal/status/trend/weight/time
  order. KPI value displays the KPI name unless a caption is supplied.
- Aggregate cells keyed by `JSON.stringify([...identities].sort())`; `[]` is the
  default measure/intersection. Aggregates are explicitly supplied, never inferred
  by adding totals or flattening a set into a sum.

The adapter implements member/tuple display, properties, set captions/counts,
ranking, all seven sort modes, KPI lookup and aggregate selection. Array inputs
form tuples for CUBEMEMBER and member lists for CUBESET. A WeakMap retains identity
behind returned captions, including empty set captions and duplicate captions.
Unknown connections return `#NAME?`; unknown snapshot expressions/properties/cells
return `#N/A`; a plain caption cannot substitute for a CUBESET identity.
Empty sets count as zero. Numeric rank and enum inputs use runtime numeric
coercion; the snapshot requires finite integral ranks/enums. This is a documented
model policy pending Excel oracle checks of fractional inputs, not an assertion
that Excel always rejects instead of truncating them.

Limitations: this is an explicit snapshot adapter, not an MDX parser, hierarchy
validator or live SSAS client. Hosts must supply consistent tuples and sets,
including hierarchy compatibility and distinctness. Sort 3/4 uses deterministic
UTF-16 caption order (ASCII fixtures); real server collation can differ. Sort 5/6
preserves/reverses supplied provider order, which must already be natural order.
Session members, dynamic slicers, arbitrary MDX tuple strings/expressions and
Power Pivot-specific capabilities require a richer host. Metadata survives only
while original scalar objects and the service instance survive. Restoring caches
alone does not restore metadata. The adapter charges list traversal and sort work;
service limit exceptions propagate, as do evaluator budget exceptions.

## Validation and fixture inventory

`bun test packages/formulas/test/cube.test.ts` runs the direct module tests with a
category-local context until shared engine integration. The suite exercises every
name with successful and failing calls, missing/declined services, arity, reference
errors, finite and extreme ranks, all KPI components and sort modes, custom and
duplicate captions, empty sets, properties, nested calls, null values, references,
range arrays, literal length limits, long references, overflow, and budget bounds.
It verifies the service invocation contract and exception propagation.

`packages/formulas/test/fixtures/cube.ts` exports 38 corpus `cases`:
35 explicitly flagged `requiresService: true, oracle: "host"` modeled cases and
3 `oracle: "excel"` cases (overlong member/set literals and propagated reference
error). The modeled inventory has 5 member, 4 property, 4 KPI, 5 set, 3 count,
6 ranked-member, and 8 value cases. Modeled cases require the exported
`cubeFixtureConnections` Sales snapshot. They are retained in corpus inventory
and excluded from standalone success counts. They must not be represented as
connection-free Excel recalculation successes. Even an Excel installation cannot
validate modeled success without an equivalent configured OLAP cube.
All input references use `Inputs!A1`; each case can be written as its own uncached
Inputs/Results XLSX. No expected value relies on a pre-existing formula cache.
Generated document edits/reopen/preservation, actual Excel error precedence,
independent consumers and independent GPT-6.1 sol high reviews remain coordinator
work. Excel oracle access was requested through internal coordination; this
category did not drive the installed Excel application.

Fixture provenance: original synthetic fruit/revenue data and tests authored for
Tumbler and licensed under the repository MIT license. No proprietary workbook,
server dump or Microsoft example data is redistributed. Expectations follow the
Microsoft descriptions below plus the explicit finite model policies above.
No new third-party dependency was added.

## Primary semantic references

- [CUBEKPIMEMBER](https://support.microsoft.com/en-us/excel/functions/cubekpimember-function): six KPI properties, captions, invalid-name errors and Analysis Services requirement.
- [CUBEMEMBER](https://support.microsoft.com/en-us/excel/functions/cubemember-function): tuple arrays/ranges, identity versus caption, expression length and error semantics.
- [CUBEMEMBERPROPERTY](https://support.microsoft.com/en-us/excel/functions/cubememberproperty-function): properties and multidimensional cube requirement (Power Pivot model limitation).
- [CUBERANKEDMEMBER](https://support.microsoft.com/en-us/excel/functions/cuberankedmember-function): one-based ranks, set references and captions.
- [CUBESET](https://support.microsoft.com/en-us/excel/functions/cubeset-function): sort modes 0–6, default order, sort measure requirements and reference length exception.
- [CUBESETCOUNT](https://support.microsoft.com/en-us/excel/functions/cubesetcount-function): sets and nested/reference forms.
- [CUBEVALUE](https://support.microsoft.com/en-us/excel/functions/cubevalue-function): default measure, identity metadata, aggregation and NULL-to-empty-text conversion.
