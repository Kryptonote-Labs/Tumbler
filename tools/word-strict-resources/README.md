# Strict generated resources

The fixture reconciles a decimal list and a two-row merged table into a minimal
Strict or Transitional package. It exercises generated theme and numbering parts,
table/cell widths, cell margins and all four borders. The baseline is PR123 at
`c6ffe1c782006d69efe4c5159700120cd86b40d0`.

```sh
bun tools/word-strict-resources/generate.ts /tmp/strict-resources
PYTHONPATH=/tmp/word-audit-pylibs python3 tools/word-strict-resources/validate.py strict /tmp/word-audit-standards/OfficeOpenXML-XMLSchema-Strict.zip /tmp/strict-resources/strict.docx
PYTHONPATH=/tmp/word-audit-pylibs python3 tools/word-strict-resources/validate.py transitional /tmp/word-audit-standards/OfficeOpenXML-XMLSchema-Transitional.zip /tmp/strict-resources/transitional.docx
flock -x /tmp/tumbler-word-audit-heavy.lock timeout 5m bun tools/word-strict-resources/benchmark.ts
```

The validator needs Python lxml and the ECMA schema archives. It supplies the
standard XML namespace schema import and normalizes invalid on/off defaults in
temporary Strict WML schema copies to true/false. It does not change substantive
instance constraints. Actual generated document, numbering and theme XML is
validated against the requested dialect, including incorrect namespace roots.
Desktop Word was not run.

Baseline Strict validation reports 26 errors across three parts. The fixed fixture
validates all three parts with zero errors. Transitional validation passes all
three parts before and after; all six ZIP member payloads are byte-identical.
The list marker remains `1.`, table and merged-cell widths remain 4000 twips, and
cell margins remain 10/20/30/40 twips. Focused tests also cover edit/reopen and
unchanged theme/numbering bytes.

The benchmark performs the same generate/reconcile/serialize operation in both
revisions, with 10 warmups and 9 samples of 10 operations. Run the two revisions
sequentially under one lock on the same host. Timings are milliseconds per
operation, CPU is user plus system microseconds per operation, heap deltas are
retained heap growth per sample rather than allocated bytes. RSS is process peak.
No performance improvement is claimed by this correctness fix.
