# Word numbering audit measurements

From the repository root, with Bun installed and working-tree dependencies installed:

```sh
bash tools/word-numbering/compare.sh /tmp/word-numbering-results
```

The script reconstructs audit commit `4d1465ddf85ee238a727dbed75aac7bf043f05f8`
in a temporary directory and installs its frozen dependencies. It copies the same
benchmark and behavioral repro tests into that checkout, then runs baseline and
current measurements sequentially under one shared host lock. Setup and dependency
installation happen before acquiring the lock. The paired measurements and repro
tests have a ten-minute execution timeout, excluding lock wait time. Do not wrap
this script in another `flock`. It removes
only that generated temporary checkout on exit. Tests do not overlap benchmarks.

Each case uses two warmups and seven measured samples, with one operation per
sample. `Bun.gc(true)` runs before each timed sample. The timing includes consuming
every output character, including flattening any rope strings. Fixtures are
synthetic, with no private document data. Runtime, CPU model and logical CPU count
are recorded in the first JSONL row.

Cases:

- Eight upper-Roman markers beginning at 2,147,483,647 with the default budget.
  The fixed version rejects the first expansion before allocating its symbols.
  This measures bounded rejection, not equivalent successful formatting.
- The same eight markers with a 20,000,000-character opt-in budget.
  Character counts and checksums must match the baseline exactly.
- Eight ordinary Roman markers beginning at one. Outputs must match exactly.
- Export of 100 imported decimal items plus one appended item sharing the source
  identity. The first 100 markers remain equivalent; the final marker changes
  from `1.` to `101.`. Native preview's final marker is recorded too.

Each sample records elapsed milliseconds, logical UTF-16 units and bytes,
a character checksum, and changes in `heapUsed` and RSS. UTF-16 bytes describe
the logical output size, not actual engine allocation. Heap/RSS deltas are noisy
process observations, not allocated-byte counts or peak-memory measurements.
Roman formatting previously iterated once per emitted symbol; the fixed formatter
preflights at most 13 quotient counts per numeral before constructing its output.
The default extreme case rejects at the first quotient count.

`before-tests.txt` must contain behavioral failures, and `after-tests.txt` must
pass. Review these logs rather than treating any baseline failure as a valid
repro: missing dependencies or malformed fixtures do not establish the bug.

This shared host runs other agents. The advisory lock serializes cooperating
heavy tasks but cannot eliminate OS or unrelated-process noise. Inspect raw
samples, repeat noisy paired runs under the same lock, and avoid speedup claims
from unmatched or contended runs. Measurement results belong in the PR's
validation evidence with the tested HEAD and raw samples.
