<script lang="ts">
  import { onMount } from 'svelte';
  import { mergePdfDocuments, openPdfDocument, parsePdfPageSelection, type PdfDocument } from '@tumblerjs/pdf';

  /** Hosts may intercept the finished PDF instead of the default browser download. */
  let { onmerge, sources = [], submitLabel = 'Merge and download PDF' }: { onmerge?: (bytes: Uint8Array, filename: string) => void | Promise<void>; sources?: { name: string; bytes: Uint8Array }[]; submitLabel?: string } = $props();
  type Block = {
    id: number; name: string; bytes: Uint8Array; password: string;
    document?: PdfDocument; pages: string; error: string;
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
    } catch (cause) {
      block.document = undefined;
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
  <div class="intro">
    <p>Add PDFs, choose pages, then arrange the blocks in output order. Files are combined in your browser.</p>
    <label class="upload">Add PDF files<input type="file" accept=".pdf,application/pdf" multiple onchange={upload} disabled={reading} /></label>
  </div>
  <p class="hint">Leave Pages empty for every page. Use numbers or inclusive ranges, such as 5,2-4 or 3-1,1. Repeats are allowed. Duplicate a block to insert more pages from the same PDF elsewhere.</p>
  {#if !blocks.length}<p class="empty">Add your first PDF to begin.</p>{/if}
  <ol aria-label="PDF merge order">
    {#each blocks as block, index (block.id)}
      <li>
        <fieldset>
          <legend>{index + 1}. {block.name}</legend>
          <div class="fields">
            <label>Pages<input aria-label={`Pages for block ${index + 1}`} type="text" bind:value={block.pages} placeholder={block.document ? `All ${block.document.pages.length} pages` : 'All pages'} oninput={() => { error = ''; status = ''; }} /></label>
            <label>Password (if needed)<input aria-label={`Password for block ${index + 1}`} type="password" bind:value={block.password} oninput={event => { block.password = event.currentTarget.value; open(block); }} autocomplete="off" /></label>
          </div>
          {#if block.error}<p class="error" role="alert">{block.error}</p>{:else}<p class="count">{block.document?.pages.length} source {block.document?.pages.length === 1 ? 'page' : 'pages'}</p>{/if}
          <div class="actions">
            <button type="button" aria-label={`Move block ${index + 1} up`} disabled={index === 0 || reading} onclick={() => move(index, -1)}>Move up</button>
            <button type="button" aria-label={`Move block ${index + 1} down`} disabled={index === blocks.length - 1 || reading} onclick={() => move(index, 1)}>Move down</button>
            <button type="button" aria-label={`Duplicate block ${index + 1}`} disabled={reading} onclick={() => duplicate(index)}>Duplicate</button>
            <button type="button" aria-label={`Remove block ${index + 1}`} disabled={reading} onclick={() => { blocks = blocks.filter(item => item.id !== block.id); status = ''; }}>Remove</button>
          </div>
        </fieldset>
      </li>
    {/each}
  </ol>
  <div class="finish">
    <label>Output filename<input aria-label="Output filename" type="text" bind:value={filename} /></label>
    <button type="button" disabled={!blocks.length || reading || !!plan.error} onclick={merge}>{submitLabel}</button>
  </div>
  {#if plan.error && blocks.every(block => !block.error)}<p class="error" role="alert">{plan.error}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <p class="status" role="status">{reading ? 'Reading files…' : status || (pageCount ? `${pageCount} ${pageCount === 1 ? 'page' : 'pages'} in output order` : '')}</p>
</div>

<style>
  .pdf-merge { color: var(--text, #202820); font: inherit; }
  .intro p, .hint { line-height: 1.6; }
  .hint, .count, .status { color: var(--soft, #5c675c); font-size: 0.85em; }
  .upload { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-weight: 600; }
  .upload input { max-width: 100%; }
  ol { padding: 0; list-style: none; display: grid; gap: 16px; margin: 24px 0; }
  fieldset { border: 1px solid var(--border, #bcc8bc); padding: 16px; border-radius: 8px; min-width: 0; }
  legend { font-weight: 600; padding: 0 6px; overflow-wrap: anywhere; }
  .fields, .finish, .actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
  .fields label, .finish label { display: grid; gap: 6px; flex: 1 1 180px; font-size: 0.85em; }
  input[type='text'], input[type='password'] { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--border, #a5b5a5); border-radius: 4px; padding: 9px; background: var(--bg, white); color: inherit; font: inherit; }
  button { cursor: pointer; padding: 8px 12px; border: 1px solid var(--border, #a5b5a5); border-radius: 4px; background: var(--surface, #f0f4f0); color: inherit; font: inherit; font-size: 0.85em; }
  button:disabled { opacity: 0.5; cursor: default; }
  .finish button { background: var(--accent, #246644); color: var(--accent-ink, white); padding: 10px 16px; }
  .error { color: var(--danger, #b82222); overflow-wrap: anywhere; }
  .empty { padding: 28px 0; color: var(--soft, #5c675c); }
</style>
