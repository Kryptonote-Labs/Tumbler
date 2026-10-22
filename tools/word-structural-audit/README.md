# Structural editing audit evidence

Baseline: `4d1465ddf85ee238a727dbed75aac7bf043f05f8`. Implementation measured:
`9c8f38d2a2c31702e2ed4cc2aa5fef39952cdddd`. Later changes only correct the
measurement setup, clarify the budget contract, remove whitespace and record evidence.

Run from the repository root:

```sh
bash tools/word-structural-audit/compare.sh /tmp/word-structural-results
```

Do not wrap this command in another `flock`. It prepares the frozen baseline
outside the lock, then acquires `/tmp/tumbler-word-audit-heavy.lock` once for both
revisions and the behavioral repros. Actual execution is bounded to 10 minutes;
lock acquisition is not timed out. The baseline checkout is removed on exit.

The successful paired run used Bun 1.4.4 on Linux x64, Intel Celeron N5095 at
2.00 GHz, 4 logical CPUs. Identical generated fixtures and code run in separate
processes on the same host. Each case has 20 warmups and 30 samples of 10 edits,
300 measured operations per revision. Fixtures are already parsed before timing;
timing includes the immutable edit and its validation/reopens. No tests ran
concurrently with these measurements. Both revisions ran under the same host
advisory lock. Other non-cooperating host activity and JIT/GC drift remain possible.
This is one paired run, not evidence of a general speedup. Earlier unlocked
measurements and a failed baseline dependency setup are excluded.

| Case | Before median / p95, ms per edit | After median / p95, ms per edit |
| --- | ---: | ---: |
| body split | 3.709 / 4.559 | 2.866 / 3.691 |
| header split | 3.889 / 5.028 | 3.035 / 3.521 |
| opaque crossing | 1.931 / 2.245 | 0.054 / 0.089 |
| section split | 3.165 / 6.246 | 2.445 / 3.115 |
| tab insertion | 1.183 / 1.869 | 1.203 / 1.508 |
| empty join | 0.660 / 1.161 | 1.184 / 1.490 |

These are correctness fixes, so most before/after outcomes are deliberately
unequal. The unchanged body-split control produces `ab`, `cd` in both revisions.
Header splitting changes from unchanged `HEAD` with corrupted body to `HE`, `AD`
with unchanged body. Opaque crossing changes from deletion to rejection.
Section splitting changes from two section-property elements to one, with the
same visible text. Tab insertion changes from `\tBA` to `A\tB`. Empty joining
changes from an exception to `B`. The faster rejection and slower successful
empty join perform different work and must not be treated as equivalent-operation
speedups or regressions.

Memory observations below cover 300 operations per case. Heap growth is the
heap-used change before the final explicit GC; retained heap is the change after
GC. These are noisy process observations, **not allocated-byte counts**. Negative
values reflect collection of earlier allocations. Peak RSS is process-wide and
cumulative across cases, in KiB on this Linux host. Allocation instrumentation
was not available in this harness.

| Case | Heap growth before / after, bytes | Retained heap before / after, bytes | Peak RSS before / after, KiB |
| --- | ---: | ---: | ---: |
| body split | 2739140 / 2558361 | 572252 / 575882 | 74224 / 72300 |
| header split | 4319495 / 2807454 | 207708 / 195840 | 74276 / 74180 |
| opaque crossing | 1225988 / 0 | 51397 / 20347 | 74276 / 74180 |
| section split | 3728382 / 2796405 | 46925 / 35556 | 74276 / 74444 |
| tab insertion | 897126 / 954084 | -17845 / 33490 | 74276 / 74444 |
| empty join | 140128 / 1072264 | 24413 / 67410 | 74276 / 74444 |

Raw samples and outcomes are in [before.jsonl](results/before.jsonl) and
[after.jsonl](results/after.jsonl).

## Correctness and checks

The initial 11 exact defect repros failed before implementation. The expanded
suite records 5 passing / 24 failing tests at baseline and 29 passing / 0 failing
tests after. It includes additional behavior contracts, so the 24 failures are
not 24 independently identified defects. In particular, persistence of parse
limits across edits intentionally extends the prior invocation-scoped contract;
it is not evidence of a previous security bypass.

Tests cover Strict and Transitional header/footer split and join, byte equality
of unrelated parts, cell-local splitting, section ownership, both control
insertion affinities, self-closing joins, and atomic crossing/budget rejection.

- `bun run check`: passed.
- `flock -x /tmp/tumbler-word-audit-heavy.lock timeout 10m bun test`: 1,456 passed,
  0 failed, 289,427 expectations, 176 files, 38.78 seconds.
- Independent GPT-6.1 Sol high review of implementation HEAD found no actionable
  issues, with 29 new, 28 existing and 21 supplemental scenarios passing.
- Local docs build and browser tests were omitted for this headless change;
  required final-SHA CI checks remain the handoff gate.

Section ownership follows the existing native exporter and
[Microsoft's SectionProperties documentation](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.sectionproperties?view=openxml-3.0.1).
No whole-implementation compliance or security claim follows from this PR.
