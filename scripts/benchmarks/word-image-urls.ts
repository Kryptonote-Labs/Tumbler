import { WordImageUrls } from '../../packages/svelte/src/word-image-urls.ts';
import { cpus } from 'node:os';

// Frozen audit implementation, measured with the same generated input and URL API.
class AuditImageUrls {
  private images = new WeakMap<Uint8Array, string>();
  private created = new Set<string>();
  get(image: { bytes: Uint8Array; contentType: string }): string {
    const previous = this.images.get(image.bytes);
    if (previous !== undefined) return previous;
    const url = URL.createObjectURL(new Blob([Uint8Array.from(image.bytes).buffer], { type: image.contentType }));
    this.images.set(image.bytes, url);
    this.created.add(url);
    return url;
  }
  retain(_active: ReadonlySet<string>) {}
  destroy() { this.created.forEach(url => URL.revokeObjectURL(url)); }
}
const create = URL.createObjectURL.bind(URL);
const revoke = URL.revokeObjectURL.bind(URL);
let created = 0, revoked = 0, allocated = 0, peak = 0;
const live = new Map<string, number>();
URL.createObjectURL = blob => {
  const url = create(blob);
  created++;
  allocated += blob.size;
  live.set(url, blob.size);
  peak = Math.max(peak, [...live.values()].reduce((a, b) => a + b, 0));
  return url;
};
URL.revokeObjectURL = url => { revoked++; live.delete(url); revoke(url); };
const bytes = Uint8Array.from({ length: 1024 * 1024 }, (_, i) => i % 251);
function sample(Owner: typeof WordImageUrls | typeof AuditImageUrls) {
  created = revoked = allocated = peak = 0;
  const owner = new Owner();
  const start = performance.now();
  for (let edit = 0; edit < 120; edit++) {
    const url = owner.get({ elementId: 1, bytes: bytes.slice(), contentType: 'image/png' });
    owner.retain(new Set([url]));
  }
  const edits = { created, revoked, live: live.size, retainedBytes: [...live.values()].reduce((a, b) => a + b, 0) };
  for (let swap = 0; swap < 120; swap++) {
    const next = bytes.slice(); next[0] = swap + 1;
    const url = owner.get({ elementId: 1, bytes: next, contentType: 'image/png' });
    owner.retain(new Set([url]));
  }
  const ms = performance.now() - start;
  const swaps = { created, revoked, live: live.size, retainedBytes: [...live.values()].reduce((a, b) => a + b, 0) };
  owner.destroy();
  return { ms, edits, swaps, allocatedBlobBytes: allocated, peakBlobBytes: peak, liveAfterDestroy: live.size };
}
console.log(JSON.stringify({ runtime: Bun.version, cpu: cpus()[0]?.model, cpuCount: cpus().length, bytes: bytes.length, warmups: 2, samples: 7 }));
for (const Owner of [AuditImageUrls, WordImageUrls]) {
  for (let i = 0; i < 2; i++) { sample(Owner); Bun.gc(true); }
  const runs = Array.from({ length: 7 }, () => { Bun.gc(true); return sample(Owner); });
  console.log(JSON.stringify({ owner: Owner.name, medianMs: runs.map(r => r.ms).sort((a, b) => a - b)[3], runs }));
}
