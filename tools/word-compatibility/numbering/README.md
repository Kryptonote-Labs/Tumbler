# Numbering semantics evidence

The fixtures in `packages/word/test/numbering-semantics.test.ts` cover imported style
numbering, numbering-style links, restart policies, and omitted starts. Each valid
case checks package markers, native markers, and text-edit/export/reopen markers,
plus unchanged numbering-part bytes. The original four failures were independently
reproduced before editing the implementation.

At baseline `db5cf0b`, the focused suite has 1 pass and 11 failures. With the fix it
has 12 passes and 85 assertions. The four reported marker changes are:

- Style-derived numbering: no marker becomes `1.`.
- Numbering-style link: no marker becomes `1.`.
- Level sequence 0,1,0,1 with restart zero: `1.,1.,2.,1.` becomes `1.,1.,2.,2.`.
- Omitted imported start: `1.,2.` becomes `0.,1.`. Authored lists still start at one.

## Sources and interoperability limits

[Numbering properties](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.numberingproperties?view=openxml-3.0.1)
defines style-derived numbering and selection through the level's `pStyle`, ignoring
`ilvl` inside a paragraph style. [Numbering style links](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.numberingstylelink?view=openxml-3.0.1)
reference a numbering style, whose instance supplies the underlying definition.
[`basedOn`](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.basedon?view=openxml-3.0.1)
is ignored for numbering styles. Native style changes resolve preserved direct
numbering against the edited style; newly inserted styled paragraphs do the same.
Review repros initially produced native `1.` versus exported `5.` after changing
A to B, and omitted a native marker for a new B paragraph. Both paths now agree.
The expanded semantics and budget suites pass 30 tests with 148 assertions.

[Starting values](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.startnumberingvalue?view=openxml-3.0.1)
default to zero when omitted. Microsoft's [Word implementation notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/8f145055-5422-4df0-933d-e67a81c633cd)
do not specify a different omitted default. They do say Word ignores an embedded
override-level `start`; this change preserves Tumbler's existing use of that value,
with instance `startOverride` taking precedence. No desktop Word run was performed.

[Restart policy](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.levelrestart?view=openxml-3.0.1)
uses zero to disable automatic restarts. Microsoft's [Word behavior notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/dcd6f842-6686-4b2c-8201-9bfbe582af45)
reset on the trigger or any earlier level. This implementation keeps that behavior,
and applies effective level overrides. Word's documented choice to ignore
`lvlRestart` in embedded overrides is not emulated. These tests do not establish
full Word interoperability or general OOXML conformance.

## Matched measurement

Run `bash tools/word-compatibility/numbering/run-pair.sh db5cf0b /tmp/numbering-pair`
from the repository root. The runner extracts the baseline, installs frozen
dependencies outside the lock, and runs both versions under the same exclusive
`/tmp/tumbler-word-audit-heavy.lock` lock with a ten-minute execution timeout.

The identical generated fixture contains 10,000 paragraphs and three decimal
levels with explicit starts and default restarts. Each process opens it once,
warms up ten times, then records fifteen samples. Every sample resolves 10,000
markers and formats 10,000 values, consuming every output character in a checksum.
The timed region excludes fixture construction and package parsing. This measures
the existing direct-numbering path, not the cost of the newly supported style
paths. Checksums and marker counts must match. Results include raw wall and CPU
times, heap deltas, and RSS deltas. Heap deltas are retained-heap observations,
not total allocated bytes; GC and process scheduling can affect them.

Run behavioral tests with `bun test packages/word/test/numbering-semantics.test.ts`.
For the failing baseline, copy this test into the extracted baseline and run it
there with the same Bun runtime. Do not run tests concurrently with measurements.
