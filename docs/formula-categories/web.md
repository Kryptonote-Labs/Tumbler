# Web formula category

Owned module: `packages/formulas/src/functions/web.ts`, exporting `webFunctions`.
Two names calculate locally (ENCODEURL and a documented FILTERXML subset); one
name (WEBSERVICE) needs an explicit host service for successful requests. This is
not a claim of complete FILTERXML/XPath or Windows Excel parity.

## Microsoft semantics sources

- [ENCODEURL](https://support.microsoft.com/en-us/excel/functions/encodeurl-function):
  percent encoding, including Microsoft's SharePoint example.
- [FILTERXML](https://support.microsoft.com/en-us/excel/functions/filterxml-function):
  XML and XPath inputs, invalid XML errors, attribute selection and dynamic arrays.
- [WEBSERVICE](https://support.microsoft.com/en-us/excel/functions/webservice-function):
  HTTP service content, unsupported protocol errors, 2048-character URL and
  32767-character cell limits.

All three rely on Windows features in native Excel and cannot provide a native
calculation oracle on the available Mac. Windows Excel verification remains an
integration requirement. Unit-test expectations beyond the published example
are modeled expectations, not independently measured Excel outputs. In
particular numeric XML conversion, empty elements, whitespace, URL punctuation,
and scalar argument coercion should be checked against that oracle.

## Behavior and boundaries

ENCODEURL encodes UTF-8 bytes with uppercase hexadecimal percent escapes and
preserves RFC 3986 unreserved characters. Spaces become `%20`, percent signs
are encoded again, and reserved URI delimiters are encoded. Numbers, booleans,
and blank scalar references use the shared `functionText` conversion. Errors
propagate. Malformed UTF-16 and input/output exceeding the cell limit return
`#VALUE!`. No optional arguments or date-system dependence exist.

FILTERXML locally parses bounded XML elements, attributes, predefined/numeric
entities, comments, processing instructions, CDATA and mixed content. XML line
endings and literal attribute whitespace are normalized. It supports absolute
child paths, descendant paths, wildcard elements, terminal attributes and
`text()`, integer positional predicates (per parent), and attribute equality
predicates. It preserves document order and deduplicates selected elements.
Multiple matches return a vertical array. Numeric lexical node contents become
finite numbers; other contents retain their text. Invalid XML and no matches
return `#VALUE!`.

General XPath (functions, axes, union, arbitrary predicates, relative paths),
namespace processing, DTDs, and Unicode XML names require an explicit FILTERXML
host implementation. XML node and selection sizes are bounded by
`maxArrayCells`; the evaluator operation budget is charged for scanning,
parsing, traversal and host results. Budget exceptions are not swallowed.
Input arrays/lambdas are rejected via shared scalar coercion; automatic
broadcasting over array arguments is not implemented. Locale-specific numeric,
boolean, and date/time conversion of XML text is not implemented. These limits
must not be described as complete Excel parity.

## Explicit host adapter

`context.services.invoke("WEBSERVICE", [{type:"string", value:url}], address)`
returns a string scalar containing the response body or an Excel error scalar
(e.g. `#VALUE!` for a transport/HTTP/decoding failure). Requests must have HTTP or
HTTPS URLs of at most 2048 characters. Successful bodies must fit 32767 UTF-16
code units. Unexpected host value types are rejected. The formula module performs
no network IO. The host decides how it acquires data (for example a preloaded,
deterministic response map), enforces its own resource limits, and reports
failures. A thrown host exception is intentionally not converted to a formula
error or used to hide budget exhaustion.

`context.services.invoke("FILTERXML", [xmlScalar, xpathScalar], address)` can
supply results for the unsupported XML/XPath features above. Such a host must
validate XML/XPath itself, disallow external entity resolution and implicit IO,
and return correctly typed scalar/rectangular array results. Returned array
shape and size and string lengths are validated by the category. No registered
function is called by an alternative evaluator and no category modules are
imported.

For either service, absent services or an `undefined` response call
`context.unavailable`. This lets the shared evaluator preserve producer caches
without claiming a successful local calculation. The direct tests assert that
this path throws through the context; cache preservation itself belongs to
coordinator integration tests.

## Fixture inventory and provenance

`packages/formulas/test/fixtures/web.ts` exports 43 cases using the shared schema:
14 ENCODEURL cases, 22 FILTERXML/composition cases, 5 WEBSERVICE error cases,
and 2 host-modeled service/composition success cases. All references use
`Inputs!A1` and all expected values are scalar objects or rectangular matrices.
The two host successes have `requiresService: true, oracle: "host"`; they remain
in inventory and are excluded from local success counts. Their modeled response
is `<quote><price>42.75</price></quote>` for `https://example.test/quote`.
Unflagged cases are intended for actual uncached workbook evaluation. Case
inputs are deliberately independent of live endpoints, clocks and RNGs.

Fixtures and expected values are original synthetic examples under the
repository MIT license, except the short SharePoint example adapted from the
Microsoft ENCODEURL documentation linked above, identified by
`encode-sharepoint`. No third-party corpus, downloaded data or live response
is redistributed. Expected outputs are modeled, with that published example
as documentary evidence, rather than saved Excel caches.

Direct tests additionally cover service invocation arguments/address, absent
capabilities, host errors and type/shape/size rejection, GET and cell size
boundaries, malformed XML, operation budgets, unsupported XPath/DTD delegation,
argument counts, malformed Unicode, and array scalar coercion.

## Coordinator integration

Register `webFunctions` in the evaluator; expose the existing context services,
operation accounting and unavailable/cache behavior; retain FILTERXML vertical
arrays in the generated-document harness. No new runtime API is needed. The
coordinator owns uncached XLSX generation, edit/reopen/preservation checks,
independent consumer comparisons and independent GPT-6.1 sol high reviews.

## Independent review follow-up

Processing instructions now require valid targets. Reserved XML declarations must appear at the document start with valid version/optional encoding/standalone syntax. Malformed empty targets and misplaced declarations produce #VALUE!, while valid ordinary instructions remain supported.
