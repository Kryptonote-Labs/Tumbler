<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { mergePdfDocuments, openPdfDocument, parsePdfPageSelection, type PdfDocument, PdfError } from '@tumblerjs/pdf';

  /** Hosts may intercept the finished PDF instead of the default browser download. */
  let { onmerge, sources = [], submitLabel = 'Merge PDF', sourcePicker }: { onmerge?: (bytes: Uint8Array, filename: string) => void | Promise<void>; sources?: { name: string; bytes: Uint8Array }[]; submitLabel?: string; sourcePicker?: Snippet } = $props();
  type Block = {
    id: number; name: string; bytes: Uint8Array; password: string;
    document?: PdfDocument; pages: string; error: string; locked?: boolean;
  };
  let blocks = $state<Block[]>([]);
  let filename = $state('merged.pdf');
  let error = $state('');
  let status = $state('');
  let reading = $state(false);
  let nextId = 0;
  const plan = $derived.by(() => {
    try {
      return {
        inputs: blocks.map(block => {
          if (!block.document) throw new Error(block.error || `Open ${block.name} first.`);
          return {
            document: block.document,
            pages: block.pages.trim() ? parsePdfPageSelection(block.pages, block.document.pages.length) : undefined,
          };
        }),
        error: '',
      };
    } catch (cause) {
      return { inputs: [], error: message(cause) };
    }
  });
  const pageCount = $derived(plan.inputs.reduce((count, input) => count + (input.pages?.length ?? input.document.pages.length), 0));
  function message(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }
  function open(block: Block) {
    try {
      // PdfDocument is an immutable source graph; keep its class identity out of deep proxies.
      block.document = openPdfDocument(block.bytes, { password: block.password || undefined });
      block.error = '';
      block.locked = false;
    } catch (cause) {
      block.document = undefined;
      block.locked = cause instanceof PdfError && ['password_required', 'invalid_password'].includes(cause.code);
      block.error = message(cause);
    }
    error = '';
    status = '';
  }
  /** Add an authorized host snapshot without requiring a browser file upload. */
  export function addSource(name: string, bytes: Uint8Array) {
    const block: Block = { id: nextId++, name, bytes, password: '', pages: '', error: '' };
    open(block);
    blocks = [...blocks, block];
  }
  onMount(() => { for (const source of sources) addSource(source.name, source.bytes); });
  async function upload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    reading = true;
    error = '';
    status = '';
    try {
      for (const file of files) {
        const block: Block = { id: nextId++, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), password: '', pages: '', error: '' };
        open(block);
        blocks = [...blocks, block];
      }
    } catch (cause) { error = message(cause); }
    finally { reading = false; }
  }
  function move(index: number, delta: number) {
    const next = [...blocks];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    blocks = next;
    status = '';
  }
  function duplicate(index: number) {
    const original = blocks[index]!;
    blocks = [...blocks.slice(0, index + 1), { ...original, id: nextId++ }, ...blocks.slice(index + 1)];
    status = '';
  }
  async function merge() {
    if (reading) return;
    reading = true;
    error = '';
    status = '';
    try {
      if (plan.error) throw new Error(plan.error);
      if (!filename.trim() || !/\.pdf$/i.test(filename.trim())) throw new Error('Choose an output filename ending in .pdf.');
      const bytes = mergePdfDocuments(plan.inputs);
      const name = filename.trim();
      if (onmerge) await onmerge(bytes, name);
      else {
        const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      status = `Created ${name} with ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}.`;
    } catch (cause) { error = message(cause); }
    finally { reading = false; }
  }
</script>

<div class="pdf-merge">
  <div class="source-actions">
    {@render sourcePicker?.()}
    <label class="upload">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 11V2m-3 3 3-3 3 3M2 10v4h12v-4" /></svg>
      Upload
      <input aria-label="Upload PDFs" type="file" accept=".pdf,application/pdf" multiple onchange={upload} disabled={reading} />
    </label>
  </div>
  <div class="sources">
    {#if !blocks.length}<p class="empty">Add a PDF to begin.</p>{/if}
    <ol aria-label="PDF merge order">
      {#each blocks as block, index (block.id)}
        <li>
          <div class="source-heading">
            <span class="order">{index + 1}</span>
            <span class="name" title={block.name}>{block.name}</span>
            <div class="actions">
              <button type="button" aria-label={`Move block ${index + 1} up`} title="Move up" disabled={index === 0 || reading} onclick={() => move(index, -1)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3m-4 4 4-4 4 4" /></svg>
              </button>
              <button type="button" aria-label={`Move block ${index + 1} down`} title="Move down" disabled={index === blocks.length - 1 || reading} onclick={() => move(index, 1)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10m-4-4 4 4 4-4" /></svg>
              </button>
              <button type="button" aria-label={`Duplicate block ${index + 1}`} title="Duplicate" disabled={reading} onclick={() => duplicate(index)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2h8v8H6zM3 5H2v9h9v-1" /></svg>
              </button>
              <button type="button" aria-label={`Remove block ${index + 1}`} title="Remove" disabled={reading} onclick={() => { blocks = blocks.filter(item => item.id !== block.id); status = ''; }}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
              </button>
            </div>
          </div>
          <label class="pages">Pages
            <input aria-label={`Pages for block ${index + 1}`} title="Page numbers or ranges, e.g. 3,1-2. Leave empty for all pages." type="text" bind:value={block.pages} placeholder={block.document ? `All ${block.document.pages.length} pages` : 'All pages'} oninput={() => { error = ''; status = ''; }} />
          </label>
          {#if block.locked}
            <label class="password">Password<input aria-label={`Password for block ${index + 1}`} type="password" bind:value={block.password} oninput={event => { block.password = event.currentTarget.value; open(block); }} autocomplete="off" /></label>
          {/if}
          {#if block.error}<p class="error" role="alert">{block.error}</p>{/if}
        </li>
      {/each}
    </ol>
    {#if plan.error && blocks.every(block => !block.error)}<p class="error" role="alert">{plan.error}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
  <div class="finish">
    <label class="filename">File name<input aria-label="Output filename" type="text" bind:value={filename} /></label>
    <div class="submit-row">
      <span class="status" role="status">{reading ? 'Working…' : status || `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`}</span>
      <button class="submit" type="button" disabled={!blocks.length || reading || !!plan.error} onclick={merge}>{submitLabel}</button>
    </div>
  </div>
</div>

<style>
  .pdf-merge { display: flex; flex-direction: column; min-height: 0; height: 100%; color: var(--text, #202820); font: inherit; font-size: 12px; }
  .source-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px; border-bottom: 1px solid var(--border, #ddd); }
  .upload { position: relative; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--border, #ddd); border-radius: 4px; cursor: pointer; white-space: nowrap; }
  .upload input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .upload:focus-within { outline: 1px solid var(--accent, #246644); outline-offset: 2px; }
  .sources { flex: 1; min-height: 0; overflow: auto; padding: 0 12px; }
  ol { list-style: none; padding: 0; margin: 0; }
  li { padding: 12px 0; border-bottom: 1px solid var(--border, #ddd); }
  li:last-child { border-bottom: 0; }
  .source-heading { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .order { color: var(--text-soft, #666); font-variant-numeric: tabular-nums; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .actions { display: flex; gap: 2px; }
  .actions button { display: grid; place-items: center; padding: 4px; width: 24px; height: 24px; border: 0; background: transparent; }
  svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
  .pages, .password { display: grid; grid-template-columns: 62px minmax(0, 1fr); align-items: center; gap: 8px; color: var(--text-soft, #666); }
  .password { margin-top: 8px; }
  input[type='text'], input[type='password'] { box-sizing: border-box; width: 100%; min-width: 0; padding: 6px 8px; border: 1px solid var(--border, #ddd); border-radius: 4px; background: var(--bg, white); color: var(--text, #202820); font: inherit; }
  input:focus-visible, button:focus-visible { outline: 1px solid var(--accent, #246644); outline-offset: 2px; }
  button { color: inherit; font: inherit; cursor: pointer; border-radius: 4px; }
  button:hover { background: var(--surface-hover, #f0f4f0); }
  button:disabled { opacity: 0.35; cursor: default; }
  .finish { flex-shrink: 0; border-top: 1px solid var(--border, #ddd); padding: 12px; }
  .filename { display: grid; gap: 6px; color: var(--text-soft, #666); }
  .submit-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; }
  .submit { padding: 7px 12px; border: 1px solid var(--border, #ddd); background: var(--surface, #f0f4f0); font-weight: 500; white-space: nowrap; }
  .error { color: var(--danger, #b82222); overflow-wrap: anywhere; margin: 8px 0 0; line-height: 1.5; }
  .status, .empty { color: var(--text-soft, #666); line-height: 1.5; }
  .status { min-height: 18px; }
  .empty { margin: 12px 0; }
</style>
