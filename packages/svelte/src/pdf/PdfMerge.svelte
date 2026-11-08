<script lang="ts">
  import { onMount, onDestroy, type Snippet } from 'svelte';
  import { mergePdfDocuments } from '@tumblerjs/pdf';
  import PdfMergeSourceView from './PdfMergeSource.svelte';
  import PdfMergeAdd from './PdfMergeAdd.svelte';
  import { openMergeSource, mergeSourceSelection, type PdfMergeSource, type PdfMergeRead, type PdfMergeResult } from './merge-source.ts';

  let { onmerge, sources = [], submitLabel = 'Merge PDF', sourcePicker, disabled = false }: {
    onmerge?: (bytes: Uint8Array, filename: string) => void | PdfMergeResult | Promise<void | PdfMergeResult>;
    sources?: { name: string; bytes: Uint8Array }[];
    submitLabel?: string; disabled?: boolean;
    sourcePicker?: Snippet<[upload: () => void, close: () => void]>;
  } = $props();
  let blocks = $state<PdfMergeSource[]>([]), filename = $state('');
  let expanded = $state<number>(), saving = $state(false), error = $state(''), announcement = $state('');
  let created = $state<PdfMergeResult>();
  let nextId = 0;
  const reads = new Map<number, AbortController>();
  const plan = $derived(blocks.map(source => ({ source, selection: mergeSourceSelection(source) })));
  const pageCount = $derived(plan.reduce((count, entry) => count + (entry.source.document ? entry.selection.pages.length : 0), 0));
  const problem = $derived(plan.find(entry => entry.source.loading || entry.source.error || entry.selection.error));
  const reason = $derived(problem ? problem.source.loading ? `Reading ${problem.source.name}…` : `Check ${problem.source.name}` : !pageCount ? 'Select at least one page' : '');
  function changed() { created = undefined; error = ''; }
  /** Adds a row immediately; hosts can supply cancellable authorized reads. */
  export async function addSource(name: string, data: PdfMergeRead) {
    const id = nextId++, controller = new AbortController();
    const source: PdfMergeSource = { id, name, password: '', pages: '', none: false, loading: true, error: '', locked: false };
    blocks = [...blocks, source];
    const current = blocks.find(block => block.id === id)!;
    reads.set(id, controller);
    if (expanded === undefined) expanded = id;
    if (!filename) filename = `${name.replace(/\.pdf$/i, '')} merged.pdf`;
    changed();
    try {
      const bytes = typeof data === 'function' ? await data(controller.signal) : data;
      if (controller.signal.aborted) return;
      current.bytes = bytes;
      openMergeSource(current);
    } catch (cause) {
      if (!controller.signal.aborted) current.error = cause instanceof Error ? cause.message : 'Could not read PDF.';
    } finally { current.loading = false; reads.delete(id); }
  }
  onMount(() => { for (const source of sources) void addSource(source.name, source.bytes); });
  onDestroy(() => { for (const read of reads.values()) read.abort(); });
  function upload(files: File[]) {
    for (const file of files) {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { error = 'Choose PDF files.'; continue; }
      void addSource(file.name, () => file.arrayBuffer().then(bytes => new Uint8Array(bytes)));
    }
  }
  function move(id: number, before?: number) {
    const source = blocks.find(source => source.id === id);
    if (!source || id === before) return;
    const rest = blocks.filter(source => source.id !== id);
    const index = before === undefined ? rest.length : rest.findIndex(source => source.id === before);
    if (index < 0) return;
    rest.splice(index, 0, source);
    blocks = rest;
    announcement = `Moved ${source.name} to position ${index + 1} of ${blocks.length}.`;
    changed();
  }
  function moveBy(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= blocks.length) return;
    move(blocks[index]!.id, blocks[delta < 0 ? next : next + 1]?.id);
  }
  function duplicate(index: number) {
    const original = blocks[index]!;
    const source = { ...original, id: nextId++ };
    blocks = [...blocks.slice(0, index + 1), source, ...blocks.slice(index + 1)];
    expanded = source.id;
    changed();
  }
  function remove(source: PdfMergeSource) {
    reads.get(source.id)?.abort();
    blocks = blocks.filter(block => block.id !== source.id);
    if (expanded === source.id) expanded = blocks[0]?.id;
    announcement = `Removed ${source.name}.`;
    changed();
  }
  async function merge() {
    if (saving || disabled || reason) return;
    changed();
    if (!filename.trim() || !/\.pdf$/i.test(filename.trim())) { error = 'Choose a file name ending in .pdf.'; return; }
    saving = true;
    try {
      const inputs = plan.flatMap(({ source, selection }) => source.document && selection.pages.length ? [{ document: source.document, pages: selection.pages }] : []);
      const bytes = mergePdfDocuments(inputs), name = filename.trim();
      if (onmerge) created = { name, ...await onmerge(bytes, name) };
      else {
        const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' }));
        const link = document.createElement('a'); link.href = url; link.download = name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        created = { name };
      }
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not create PDF.'; }
    finally { saving = false; }
  }
</script>

<div class="pdf-merge">
  <div class="sources">
    <ol aria-label="PDF merge order">
      {#each blocks as source, index (source.id)}
        <li><PdfMergeSourceView {source} position={index} count={blocks.length} expanded={expanded === source.id} disabled={disabled || saving}
          onexpand={() => expanded = expanded === source.id ? undefined : source.id} onchange={changed}
          onmove={delta => moveBy(index, delta)} onduplicate={() => duplicate(index)} onremove={() => remove(source)}
          ondrop={(id, after) => move(id, after ? blocks[index + 1]?.id : source.id)} /></li>
      {/each}
    </ol>
    <PdfMergeAdd onfiles={upload} {sourcePicker} disabled={disabled || saving} />
  </div>
  <div class="finish">
    <label>File name<input aria-label="Output filename" type="text" bind:value={filename} disabled={disabled || saving} oninput={changed} /></label>
    <div class="submit-row">
      <span class="status" class:error={!!error} role="status">{#if error}{error}{:else if created}Created {created.name}{:else if reason}{reason}{:else}{pageCount} {pageCount === 1 ? 'page' : 'pages'}{/if}</span>
      {#if created?.href}<a href={created.href}>Open</a>{/if}
      <button type="button" disabled={disabled || saving || !!reason} onclick={merge}>{saving ? 'Creating…' : submitLabel}</button>
    </div>
  </div>
  <span class="sr-only" aria-live="polite">{announcement}</span>
</div>

<style>
  .pdf-merge { container-type: inline-size; display: flex; flex-direction: column; min-height: 0; height: 100%; color: var(--text, #222); font: inherit; font-size: 12px; }
  .sources { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: auto; }
  ol { list-style: none; padding: 0; margin: 0; }
  .finish { flex-shrink: 0; padding: 12px; border-top: 1px solid var(--border, #ddd); }
  label { display: grid; gap: 6px; color: var(--text-soft, #666); }
  input { box-sizing: border-box; width: 100%; min-width: 0; padding: 6px 8px; border: 1px solid var(--border, #ddd); border-radius: 4px; background: var(--bg, white); color: var(--text, #222); font: inherit; }
  .submit-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; min-height: 32px; }
  .status { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--text-soft, #666); line-height: 1.5; }
  button { flex: none; padding: 7px 12px; border: 1px solid var(--border, #ddd); border-radius: 4px; background: var(--surface, #eee); color: var(--text, #222); font: inherit; font-weight: 500; white-space: nowrap; cursor: pointer; }
  button:disabled { opacity: .4; cursor: default; }
  a { color: var(--text, #222); }
  .status.error { color: var(--danger, #b82222); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
