<script lang="ts">
  import { onMount } from 'svelte';
  import { mergePdfPages, openPdfDocument, selectPdfPages, type PdfDocument } from '@tumblerjs/pdf';

  let { onmerge }: { onmerge?: (bytes: Uint8Array) => void } = $props();
  type Source = { id: number; name: string; document: PdfDocument; pages: string };
  let mounted = $state(false);
  onMount(() => { mounted = true; });
  let sources = $state<Source[]>([]);
  let nextId = 0;
  let error = $state('');
  let busy = $state(false);
  let outputName = $state('merged.pdf');
  let summary = $state('');
  async function addFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    busy = true; error = ''; summary = '';
    try {
      const loaded: Source[] = [];
      for (const file of files) loaded.push({ id: nextId++, name: file.name, document: openPdfDocument(new Uint8Array(await file.arrayBuffer())), pages: '' });
      sources = [...sources, ...loaded];
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; input.value = ''; }
  }
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= sources.length) return;
    const result = [...sources];
    [result[index], result[target]] = [result[target]!, result[index]!];
    sources = result;
  }
  function merge() {
    error = ''; summary = '';
    try {
      if (!outputName.trim().toLowerCase().endsWith('.pdf')) throw new Error('Choose a .pdf output filename.');
      const parts = sources.map((source) => ({ document: source.document, pages: source.pages === '' ? undefined : selectPdfPages(source.pages, source.document.pages.length) }));
      const bytes = mergePdfPages(parts);
      onmerge?.(bytes);
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }));
      const link = document.createElement('a'); link.href = url; link.download = outputName; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      summary = `Merged ${openPdfDocument(bytes).pages.length} pages.`;
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }
</script>

<section aria-label="PDF merger">
  <p>Add PDFs, choose pages, then arrange the source rows in output order. All processing happens in your browser.</p>
  <label>Add PDFs <input type="file" accept="application/pdf,.pdf" multiple onchange={addFiles} disabled={busy || !mounted} /></label>
  <p>Leave pages empty for all pages. Use selections such as 3,1-2 or 4-2. Repeated pages are allowed. Duplicate a source row to interleave pages from different files.</p>
  <ol>
    {#each sources as source, index (source.id)}
      <li>
        <strong>{source.name}</strong> <span>{source.document.pages.length} pages</span>
        <label>Pages for {source.name} <input bind:value={source.pages} placeholder="All pages" /></label>
        <div class="actions">
          <button onclick={() => move(index, -1)} disabled={index === 0 || busy} aria-label={`Move source ${index + 1} up`}>Up</button>
          <button onclick={() => move(index, 1)} disabled={index === sources.length - 1 || busy} aria-label={`Move source ${index + 1} down`}>Down</button>
          <button onclick={() => { sources = [...sources.slice(0, index + 1), { ...source, id: nextId++ }, ...sources.slice(index + 1)]; }} disabled={busy}>Duplicate source {index + 1}</button>
          <button onclick={() => { sources = sources.filter((s) => s.id !== source.id); }} disabled={busy}>Remove source {index + 1}</button>
        </div>
      </li>
    {/each}
  </ol>
  <label>Output filename <input bind:value={outputName} /></label>
  <button onclick={merge} disabled={busy || sources.length === 0}>Merge and download</button>
  {#if error}<p role="alert">{error}</p>{/if}
  <p role="status">{busy ? 'Reading PDFs...' : summary}</p>
</section>

<style>
  section { display: grid; gap: 1rem; max-width: 60rem; }
  p { margin: 0; line-height: 1.6; }
  ol { display: grid; gap: 1rem; padding-left: 1.5rem; }
  li { padding: 1rem; border: 1px solid #8885; border-radius: .5rem; }
  label { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin: .5rem 0; }
  input { color: inherit; background: transparent; border: 1px solid #8888; padding: .5rem; border-radius: .25rem; }
  button { font: inherit; color: inherit; background: #8882; border: 1px solid #8886; padding: .5rem .75rem; border-radius: .25rem; cursor: pointer; }
  button:disabled { opacity: .45; cursor: default; }
  .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
  [role=alert] { color: #dc4545; }
</style>
