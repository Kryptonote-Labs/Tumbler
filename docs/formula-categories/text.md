# Text category

This category exports `textFunctions` in `packages/formulas/src/functions/text.ts`.
`text-regex.ts` is its private bounded matcher; neither module imports another
category. No evaluator, parser, runtime, manifest, or sheets changes are included.

## Status and limits

All 35 requested names have success and edge/error coverage. **32 have real local
implementations, several partial; three are unresolved without a host**:
TRANSLATE, DETECTLANGUAGE, and PHONETIC. Registration, adapter responses, and cached
results are not counted as local parity. This is not a full Excel parity claim.

- ARRAYTOTEXT and VALUETOTEXT implement concise and strict string serialization,
  escaped quotes, errors as text, row delimiters, and format validation. General
  numeric rendering uses JavaScript's decimal rendering; Excel's complete General
  format and locale-specific rendering remain unresolved.
- ASC, DBCS, and JIS implement full/half-width Latin, punctuation, Japanese kana,
  and voiced kana pairs. They do not model workbook regional switches.
- BAHTTEXT implements Thai integer groups, millions, satang, negatives, zero,
  and cent rounding locally for magnitudes through 10^13. Larger magnitudes
  require an adapter instead of risking precision loss. Thai spelling and
  rounding expectations are authored cases awaiting independent Excel checking.
- CHAR and CODE implement invariant ASCII locally. Non-ASCII values require an
  adapter selecting the producer's code page (Macintosh and Windows differ).
- CLEAN strips ASCII controls 0–31, retaining NBSP and other Unicode characters.
  UNICHAR/UNICODE implement Unicode scalar values, invalid bounds, and surrogates.
- LEFTB, RIGHTB, MIDB, LENB, FINDB, SEARCHB, and REPLACEB default to non-DBCS
  behavior. A host may return DBCS-locale results through the same named service;
  undefined explicitly selects the non-DBCS default. SEARCHB implements Excel
  wildcards locally with the bounded matcher. REPLACEB calls `context.call` for
  REPLACE. Surrogate counting uses modern Unicode character semantics; historical
  compatibility versions and DBCS partial-character padding remain unresolved.
- NUMBERVALUE implements explicit decimal/group separators, percentages, space
  removal, empty input, scientific notation, and validation. Default separators
  are English-US; region-specific defaults require future locale metadata.
  VALUE supports English-US numeric/currency/scientific text, and calls
  `context.call('DATEVALUE', ...)` / `context.call('TIMEVALUE', ...)` for recognized
  date/time strings. Full localized parsing is unresolved.
- DOLLAR and FIXED implement English-US currency/grouping, rounding, negative
  decimals, optional grouping, and up to 127 decimals. Supported decimal counts
  are -308 through 127. Very large IEEE numbers may differ from Excel's 15-digit
  arithmetic. Formatting uses bounded Intl with explicit English-US locale.
- TEXT implements General, simple zero-decimal/grouping/percentage masks and
  yyyy-mm-dd, mm/dd/yyyy, dd/mm/yyyy dates, including serial 60 and the 1904 epoch.
  Other Excel format codes require an explicit TEXT service. Serial-zero display
  and localized masks are not qualified.
- REPLACE, REPT, T implement scalar behavior and errors. Scalar-returning
  operations broadcast array arguments with singleton expansion and per-cell
  error propagation; incompatible array extents pad with #N/A. Dynamic output
  REGEXEXTRACT and TEXTSPLIT do not implement nested array broadcasting.
- TEXTAFTER/TEXTBEFORE implement occurrence selection, case mode, match-end,
  fallback, negative occurrences, and empty delimiters. TEXTSPLIT supports scalar
  or array delimiter values, two dimensions, ignore-empty, case mode, and padding.
  Case folding uses JavaScript Unicode folding; locale-sensitive edge cases need
  qualification. Omitted arguments use the shared `{kind:'omitted'}` convention.
- REGEXTEST/REGEXEXTRACT/REGEXREPLACE implement a genuine common PCRE subset:
  literals, dot, ASCII character classes/ranges, negation, d/w/s classes and their
  inverses, alternation, groups, anchors, greedy/lazy repetition, bounded
  quantifiers, first/all/capture extraction, nth/negative/all replacement, and $n
  capture substitutions. User patterns are **never** passed to JavaScript RegExp.
  Each parser/matcher transition charges `context.operation`; active states and
  output cells honor `maxArrayCells`. Patterns over 2048 UTF-16 units, nesting
  over 32, lookarounds, backreferences, named/atomic groups, Unicode/POSIX classes,
  astral patterns, and nullable quantified groups require a PCRE2 host adapter.
  This subset is not full PCRE2 support. Regex size limits preserve caches through
  `context.unavailable`; state limits return #NUM!. Zero-width matches advance
  to prevent infinite loops. Full PCRE Unicode/case-fold rules remain unresolved.

## Host contract and integration dependencies

Services are explicit synchronous `context.services.invoke(name, evaluatedArgs,
context.address)` calls. No formula performs network IO, executes arbitrary code,
or loads a DLL. An undefined result for required capabilities calls
`context.unavailable`, allowing the evaluator to preserve producer caches.
Translation/detection adapters must supply their own authenticated service and
language validation; PHONETIC needs producer furigana metadata associated with the
result formula's referenced cells. Modeled tests prove dispatch, not parity.

The coordinator must register this registry, support dynamic arrays and omitted
AST arguments, and wire DATEVALUE/TIMEVALUE through `context.call`. The category's
base runtime snapshot does not yet expose the announced metadata hooks; PHONETIC
therefore remains explicitly host-dependent. Non-DBCS is the default until locale
metadata is supplied. No shared engine change is part of this commit.

## Fixtures, provenance, and verification

`packages/formulas/test/fixtures/text.ts` exports the exact corpus `cases` schema.
It contains 154 independently authored formula/expectation cases: 151 local and
3 modeled host successes marked `requiresService:true, oracle:'host'`. It covers
all 35 names, standalone and nested expressions, Inputs!A1 references, defaults,
errors, Unicode, dates, arrays, overflow, and boundary values. Expected values
are full scalar objects or rectangular matrices. No cached spreadsheet or third
party workbook is copied. Fixtures and implementation are original contributions
under this repository's MIT license. These are documentation-derived expectations,
not Excel oracle results. The coordinator owns uncached XLSX generation,
calculation, edit/reopen/preservation testing, and independent Excel/consumer
qualification. Host cases must be excluded from local-success counts.

Validation at category handoff: `bun test packages/formulas/test` and
`bun run check`. Independent GPT-6.1 sol high review and integrated document tests
remain required before project readiness.

Primary semantic sources consulted:

- [Microsoft text functions index](https://support.microsoft.com/en-us/excel/text-functions-reference)
- [ARRAYTOTEXT](https://support.microsoft.com/en-us/excel/functions/arraytotext-function)
- [VALUETOTEXT](https://support.microsoft.com/en-us/excel/functions/valuetotext-function)
- [TEXTAFTER](https://support.microsoft.com/en-us/excel/functions/textafter-function)
- [TEXTSPLIT](https://support.microsoft.com/en-us/excel/functions/textsplit-function)
- [REGEXEXTRACT](https://support.microsoft.com/en-us/excel/functions/regexextract-function)
- [REGEXREPLACE](https://support.microsoft.com/en-us/excel/functions/regexreplace-function)
- [BAHTTEXT](https://support.microsoft.com/en-us/excel/functions/bahttext-function)
- [FIXED](https://support.microsoft.com/en-us/excel/functions/fixed-function)
- [CHAR](https://support.microsoft.com/en-us/excel/functions/char-function)
- [PHONETIC](https://support.microsoft.com/en-us/excel/functions/phonetic-function)
