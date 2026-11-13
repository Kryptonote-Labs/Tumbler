/** Sample documents served from /static/samples and used by live examples. */
export type SampleFile = 'project-brief.docx' | 'project-budget.xlsx' | 'workspace-brief.pptx';

const cache = new Map<SampleFile, Promise<Uint8Array>>();

/** Fetches a sample once per page load; every example then opens its own copy of the bytes. */
export function loadSample(file: SampleFile): Promise<Uint8Array> {
  let pending = cache.get(file);
  if (!pending) {
    pending = fetch(`/samples/${file}`).then(async response => {
      if (!response.ok) throw new Error(`Sample ${file} unavailable`);
      return new Uint8Array(await response.arrayBuffer());
    });
    pending.catch(() => cache.delete(file));
    cache.set(file, pending);
  }
  return pending.then(bytes => bytes.slice());
}
