# Word viewer media URL lifecycle

Scope: audit finding 6, browser URL ownership only. The change does not alter OOXML parsing or serialization.

## Reproduction and method

The supplied artifact-edit repro was rerun at audit commit `4d1465ddf85ee238a727dbed75aac7bf043f05f8`. Each of three text insertions replaced the image's `Uint8Array` identity; the sample image contains 491 bytes.

The committed Chrome test instruments image blob creation/revocation, inserts 120 characters through the playground editor, checks decoding, replaces the document, and navigates away. It asserts that no URL is revoked while assigned to a mounted image.

The generated benchmark uses one deterministic 1 MiB byte array, 120 equal-content replacements with fresh byte identities, then 120 changed-content document swaps. Both implementations run in the same process with the same fixtures and URL API. The baseline class is copied from the audit viewer. Each has two warmups and seven measured samples, with GC between runs. Timing includes input copies, URL creation, and reconciliation; destruction occurs after timing. Blob byte counts measure registered Blob payloads, not decoded pixels, JS heap, process RSS, or exact allocator traffic.

All final heavy checks use `flock -x /tmp/tumbler-word-audit-heavy.lock`. Earlier runs overlapped other audit work and are excluded from timing claims. The lock serializes participating audit commands, but does not isolate the host from unrelated processes.

Commands:

```sh
flock -x /tmp/tumbler-word-audit-heavy.lock bun scripts/benchmarks/word-image-urls.ts
flock -x /tmp/tumbler-word-audit-heavy.lock bun test packages/svelte/test/word-image-urls.test.ts
flock -x /tmp/tumbler-word-audit-heavy.lock bun run docs:test 'word-media-lifecycle.e2e.ts$'
```

The anchored test filename matters because Playwright matches full paths and this worktree also contains `word-media-lifecycle` in its name. Local browser runs use the repository's Playwright configuration with port 43981 and `/usr/bin/google-chrome` to avoid other audit servers. Run the same test against the audit viewer for the failing-before result.

## Ownership and correctness

The cache compares MIME type and every byte before reusing a drawing URL. It retains the latest artifact identity to avoid rescanning within a render. Changed images get distinct blobs; the prior blob remains valid until no mounted image references it after Svelte's update. Scrolling out of the page window and viewer destruction release unused URLs. The ink canvas uses its existing separate URL ownership until asynchronous decoding and painting finish.

Focused tests fetch retained URLs and compare their bytes, verify released URLs can no longer be fetched, cover MIME changes, and exercise 120 changed-image swaps. The viewer expects image byte arrays to be immutable, as documented.

## Results

Chrome's sample repro fails on the audit viewer after 120 typed characters: 121 URLs created, zero revoked, 121 live, retaining 59,411 blob bytes. The fixed viewer creates one URL, revokes zero during typing, and retains one 491-byte blob. Replacing the document gives two cumulative creations, one revocation, and one live blob. Navigation releases the remaining blob. No revocation occurred while an image still referenced its URL, and image decoding passed.

Generated 1 MiB fixture, Bun 1.4.4, Intel Celeron N5095 at 2.00 GHz, four logical CPUs:

| Measurement | Audit | Fixed |
| --- | ---: | ---: |
| After 120 equal-byte replacements: create / revoke / live | 120 / 0 / 120 | 1 / 0 / 1 |
| After another 120 changed-image swaps: create / revoke / live | 240 / 0 / 240 | 121 / 120 / 1 |
| Retained blob bytes after replacements | 125,829,120 | 1,048,576 |
| Retained blob bytes after swaps | 251,658,240 | 1,048,576 |
| Peak live blob payload bytes | 251,658,240 | 2,097,152 |
| Total created blob payload bytes | 251,658,240 | 126,877,696 |
| Live URLs after destruction | 0 | 0 |
| Final run median for all 240 operations, ms | 285.019 | 197.938 |

Raw samples and operation counts are in `word-media-lifecycle.jsonl`. The timing samples vary and do not establish a general editing speedup. The deterministic improvement is bounded retained blob payload and fewer blob allocations for unchanged images. Equality checking still scans each changed byte-array identity once per drawing, and this helper benchmark excludes parsing, layout, DOM work and image decoding.

The final measured helper includes collision handling for story-local element IDs. A focused test keeps two different images with the same ID stable across three repeated pages and 120 edits. Shared byte identities across different drawing IDs also retain one blob. The initial implementation was independently reviewed; that review found the story-ID collision and prompted this correction.

Validation: the locked broad run passed 1,431 tests before the final collision test was added. All five final helper tests pass, the final Chrome lifecycle test passes, and final TypeScript checking passes. Svelte checking reports zero errors and warnings; the Node 22 production build succeeds. The earlier unrelated spreadsheet property timeout passed on its locked rerun. Repository CI remains authoritative for the final full diff.
