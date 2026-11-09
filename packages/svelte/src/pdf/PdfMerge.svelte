<script lang="ts">
  import { onMount, onDestroy, tick, type Snippet } from 'svelte';
  import { mergePdfDocuments } from '@tumblerjs/pdf';
  import PdfMergeSourceView from './PdfMergeSource.svelte';
  import PdfMergeAdd from './PdfMergeAdd.svelte';
  import { openMergeSource, mergeSourceSelection, type PdfMergeSource, type PdfMergeRead, type PdfMergeResult, type PdfMergeState, createPdfMergeState } from './merge-source.ts';

  let { onmerge, sources = [], submitLabel = 'Merge PDF', sourcePicker, disabled = false, session = $bindable() }: {
    onmerge?: (bytes: Uint8Array, filename: string) => void | PdfMergeResult | Promise<void | PdfMergeResult>;
    sources?: { name: string; bytes: Uint8Array }[];
    submitLabel?: string; disabled?: boolean;
    session?: PdfMergeState;
    sourcePicker?: Snippet<[upload: () => void, close: () => void]>;
  } = $props();
  const localState = $state(createPdfMergeState());
  const model = $derived(session ?? localState);
  let saving = $state(false), error = $state(''), announcement = $state('');
  let removed = $state<{ source: PdfMergeSource; index: number; read: PdfMergeRead | undefined }>();
  let root: HTMLDivElement;
  let over = $state(false);
  const reads = new Map<number, { controller: AbortController; data: PdfMergeRead }>();
  const plan = $derived(model.blocks.map(source => ({ source, selection: mergeSourceSelection(source) })));
  const pageCount = $derived(plan.reduce((count, entry) => count + (entry.source.document ? entry.selection.pages.length : 0), 0));
  const problem = $derived(plan.find(entry => entry.source.loading || entry.source.error || entry.selection.error));
  const blocked = $derived(!!problem || !pageCount);
  const reason = $derived(problem?.selection.error && !problem.source.rangeErrorVisible ? '' : problem ? problem.source.loading ? `Reading ${problem.source.name}…` : `Check ${problem.source.name}` : !pageCount ? model.blocks.length ? 'Select at least one page' : 'Add PDFs to begin' : '');
  function changed() { removed = undefined; model.created = undefined; error = ''; }
  /** Adds a row immediately; hosts can supply cancellable authorized reads. */
  export async function addSource(name: string, data: PdfMergeRead) {
    const id = model.nextId++;
    const source: PdfMergeSource = { id, name, password: '', pages: '', none: false, loading: true, error: '', locked: false };
    model.blocks = [...model.blocks, source];
    const current = model.blocks.find(block => block.id === id)!;
    model.expanded = id;
    if (!model.filename) model.filename = `${name.replace(/\.pdf$/i, '')} merged.pdf`;
    changed();
    void tick().then(() => root?.querySelector(`[data-source-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }));
    await readSource(current, data);
  }
  async function readSource(current: PdfMergeSource, data: PdfMergeRead) {
    const controller = new AbortController(), id = current.id;
    reads.set(id, { controller, data });
    current.loading = true;
    current.error = '';
    try {
      const bytes = typeof data === 'function' ? await data(controller.signal) : data;
      if (controller.signal.aborted) return;
      current.bytes = bytes;
      openMergeSource(current);
    } catch (cause) {
      if (!controller.signal.aborted) current.error = cause instanceof Error ? cause.message : 'Could not read PDF.';
    } finally {
      if (reads.get(id)?.controller === controller) { current.loading = false; reads.delete(id); }
    }
  }
  onMount(() => { if (model.initialized) return; model.initialized = true; for (const source of sources) void addSource(source.name, source.bytes); });
  onDestroy(() => { for (const [id, read] of reads) { read.controller.abort(); const source = model.blocks.find(source => source.id === id); if (source) { source.loading = false; source.error = 'Reading was cancelled. Add this PDF again.'; } } });
  function upload(files: File[]) {
    const pdfs = files.filter(file => /\.pdf$/i.test(file.name) || file.type === 'application/pdf');
    for (const file of pdfs) void addSource(file.name, () => file.arrayBuffer().then(bytes => new Uint8Array(bytes)));
    if (pdfs.length !== files.length) error = 'Only PDF files were added.';
  }
  function move(id: number, before?: number) {
    const source = model.blocks.find(source => source.id === id);
    if (!source || id === before) return;
    const rest = model.blocks.filter(source => source.id !== id);
    const index = before === undefined ? rest.length : rest.findIndex(source => source.id === before);
    if (index < 0) return;
    rest.splice(index, 0, source);
    model.blocks = rest;
    announcement = `Moved ${source.name} to position ${index + 1} of ${model.blocks.length}.`;
    void tick().then(() => root.querySelector<HTMLButtonElement>(`[data-source-id="${id}"] .grip`)?.focus({ preventScroll: true }));
    changed();
  }
  function moveBy(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= model.blocks.length) return;
    move(model.blocks[index]!.id, model.blocks[delta < 0 ? next : next + 1]?.id);
  }
  function duplicate(index: number) {
    const original = model.blocks[index]!;
    const source = { ...original, id: model.nextId++ };
    model.blocks = [...model.blocks.slice(0, index + 1), source, ...model.blocks.slice(index + 1)];
    model.expanded = source.id;
    changed();
  }
  function remove(source: PdfMergeSource) {
    const pending = reads.get(source.id);
    removed = { source, index: model.blocks.indexOf(source), read: pending?.data };
    reads.delete(source.id);
    pending?.controller.abort();
    if (pending) source.loading = false;
    model.blocks = model.blocks.filter(block => block.id !== source.id);
    if (model.expanded === source.id) model.expanded = model.blocks[0]?.id;
    announcement = `Removed ${source.name}.`;
    model.created = undefined; error = "";
    void tick().then(() => {
      const next = root.querySelectorAll<HTMLButtonElement>('.grip')[Math.min(removed?.index ?? 0, model.blocks.length - 1)];
      (next ?? root.querySelector<HTMLButtonElement>('button[aria-label="Add PDFs"]'))?.focus();
    });
  }
  function undoRemove() {
    if (!removed) return;
    const { source, index, read } = removed;
    model.blocks.splice(Math.min(index, model.blocks.length), 0, source);
    model.expanded = source.id;
    if (read) void readSource(source, read);
    removed = undefined;
    changed();
    announcement = `Restored ${source.name}.`;
    void tick().then(() => root.querySelectorAll<HTMLButtonElement>('.grip')[index]?.focus());
  }
  async function merge() {
    if (saving || disabled || blocked) return;
    changed();
    if (!model.filename.trim() || !/\.pdf$/i.test(model.filename.trim())) { error = 'Choose a file name ending in .pdf.'; return; }
    saving = true;
    try {
      const inputs = plan.flatMap(({ source, selection }) => source.document && selection.pages.length ? [{ document: source.document, pages: selection.pages }] : []);
      const bytes = mergePdfDocuments(inputs), name = model.filename.trim();
      if (onmerge) model.created = { name, ...await onmerge(bytes, name) };
      else {
        const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' }));
        const link = document.createElement('a'); link.href = url; link.download = name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        model.created = { name };
      }
    } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not create PDF.'; }
    finally { saving = false; }
  }
</script>

<div class="pdf-merge" bind:this={root}>
  <PdfMergeAdd onfiles={upload} {sourcePicker} disabled={disabled || saving} />
  <div class="sources" class:over role="group" aria-label="Merge sources"
    ondragover={event => { if (!disabled && !saving && event.dataTransfer?.types.includes('Files')) { event.preventDefault(); over = true; } }}
    ondragleave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) over = false; }}
    ondrop={event => { over = false; if (disabled || saving || !event.dataTransfer?.types.includes('Files')) return; event.preventDefault(); event.stopPropagation(); upload(Array.from(event.dataTransfer.files)); }}>
    {#if over}<div class="drop-hint">Drop PDFs to add</div>{/if}
    <ol aria-label="PDF merge order">
      {#each model.blocks as source, index (source.id)}
        <li><PdfMergeSourceView bind:source={model.blocks[index]!} position={index} count={model.blocks.length} expanded={model.expanded === source.id} disabled={disabled || saving}
          onexpand={() => model.expanded = model.expanded === source.id ? undefined : source.id} onchange={changed}
          onmove={delta => moveBy(index, delta)} onduplicate={() => duplicate(index)} onremove={() => remove(source)}
          ondrop={(id, after) => move(id, after ? model.blocks[index + 1]?.id : source.id)} /></li>
      {/each}
    </ol>
  </div>
  <div class="finish">
    {#if removed}<div class="undo" role="status"><span>Removed {removed.source.name}</span><button type="button" disabled={disabled || saving} onclick={undoRemove}>Undo</button></div>{/if}
    <label>File name<input aria-label="Output filename" type="text" bind:value={model.filename} disabled={disabled || saving} oninput={changed} /></label>
    <div class="submit-row">
      <span class="status" class:error={!!error} role="status">{#if error}{error}{:else if model.created}Created {model.created.name}{:else if reason}{reason}{:else}{pageCount} {pageCount === 1 ? 'page' : 'pages'}{/if}</span>
      {#if model.created?.href}<a href={model.created.href}>Open</a>{/if}
      <button type="button" disabled={disabled || saving || blocked} onclick={merge}>{saving ? 'Creating…' : submitLabel}</button>
    </div>
  </div>
  <span class="sr-only" aria-live="polite">{announcement}</span>
</div>

<style>
  .pdf-merge { container-type: inline-size; display: flex; flex: 1; flex-direction: column; min-width: 0; width: 100%; min-height: 0; height: 100%; box-sizing: border-box; color: var(--text, #222); font: inherit; font-size: 12px; }
  .sources { position: relative; display: flex; flex: 1; flex-direction: column; min-height: 0; overflow: auto; }
  .drop-hint { position: absolute; inset: 8px; z-index: 3; pointer-events: none; display: grid; place-items: center; min-height: 90px; border: 1px dashed var(--accent, #246644); background: var(--bg, white); }
  .undo { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .undo span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
