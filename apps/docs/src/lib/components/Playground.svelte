<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { samples, type Sample } from '$lib/site';
  import { openWordEditingSession, type WordEditingSession } from '@tumblerjs/word';
  import { openSpreadsheetArtifact, type SpreadsheetArtifact } from '@tumblerjs/sheets';
  import { openPresentationEditingSession, type PresentationEditingSession } from '@tumblerjs/slides';
  import PresentationEditor from './PresentationEditor.svelte';
  import WordEditor from './WordEditor.svelte';
  import SheetEditor from './SheetEditor.svelte';
  let { sample }: { sample: Sample } = $props();
  type OpenDocument = { kind: 'slides'; session: PresentationEditingSession } | { kind: 'word'; session: WordEditingSession } | { kind: 'sheets'; artifact: SpreadsheetArtifact };
  let document = $state<OpenDocument>();
  let original = $state<Uint8Array>();
  let output = $state<Uint8Array | (() => Uint8Array)>();
  let filename = $state('');
  let dirty = $state(false);
  let revision = $state(0);
  let editable = $state(false);
  let width = $state('full');
  let scale = $state(1);
  let error = $state('');
  let fileInput = $state<HTMLInputElement>();
  let loading = $state(true);
  let request = 0;
  const maximumFileSize = 20 * 1024 * 1024;

  $effect(() => {
    const id = ++request;
    const controller = new AbortController();
    const currentSample = sample;
    loading = true;
    error = '';
    void fetch(`/samples/${currentSample.file}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Sample unavailable');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (request === id) open(bytes, currentSample.file);
    }).catch(cause => {
      if (!controller.signal.aborted && request === id) { error = 'Could not load the sample. Try opening a local file.'; loading = false; }
    });
    return () => controller.abort();
  });
  $effect(() => {
    const requestedWidth = page.url.searchParams.get('width');
    width = requestedWidth && ['360', '640', '960'].includes(requestedWidth) ? requestedWidth : 'full';
  });

  function open(bytes: Uint8Array, name: string) {
    try {
      const next: OpenDocument = name.toLowerCase().endsWith('.docx')
        ? { kind: 'word', session: openWordEditingSession(bytes) }
        : name.toLowerCase().endsWith('.pptx') ? { kind: 'slides', session: openPresentationEditingSession(bytes) } : { kind: 'sheets', artifact: openSpreadsheetArtifact(bytes) };
      document = next;
      original = bytes;
      output = bytes;
      filename = name;
      dirty = false;
      revision += 1;
      error = '';
    } catch { error = 'Could not open this file. It may be damaged, encrypted, or unsupported.'; }
    loading = false;
  }
  async function upload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.(docx|xlsx|pptx)$/i.test(file.name)) { error = 'Choose a DOCX, XLSX, or PPTX file.'; return; }
    if (file.size > maximumFileSize) { error = 'Choose a file smaller than 20 MB.'; return; }
    const id = ++request;
    try { const bytes = new Uint8Array(await file.arrayBuffer()); if (request === id) open(bytes, file.name); }
    catch { if (request === id) error = 'Could not read this file.'; }
  }
  function changed(bytes: Uint8Array | (() => Uint8Array), modified: boolean) { output = bytes; dirty = modified; }
  function download() {
    if (!output) return;
    const blob = new Blob([Uint8Array.from(typeof output === 'function' ? output() : output).buffer], { type: document?.kind === 'word' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : document?.kind === 'slides' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function resize(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    width = value;
    const url = new URL(page.url);
    if (value === 'full') url.searchParams.delete('width'); else url.searchParams.set('width', value);
    void goto(url, { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>
<div class="playground-heading"><h1>Playground</h1><a class="quiet-link" href={sample.format === 'word' ? '/docs/word' : sample.format === 'slides' ? '/docs/powerpoint' : '/docs/spreadsheets'}>Read the docs <span aria-hidden="true">↗</span></a></div>
<p class="playground-description">Open a sample or bring your own file. Edits stay in this browser until you download them.</p>
<div class="playground-controls">
  <label class="sample-picker"><span class="control-label">Example</span><select aria-label="Example" value={sample.id} onchange={event => goto(`/playground/${event.currentTarget.value}`)}>{#each samples as item}<option value={item.id}>{item.label} · {item.format === 'word' ? 'Word' : item.format === 'slides' ? 'PowerPoint' : 'Excel'}</option>{/each}</select></label>
  <div class="file-actions"><input bind:this={fileInput} type="file" accept=".docx,.xlsx,.pptx" onchange={upload} aria-label="Choose a document" hidden /><button onclick={() => fileInput?.click()}>Open file <span aria-hidden="true">↑</span></button></div>
</div>
<div class="workspace">
  <div class="workspace-toolbar">
    <div class="mode-switch" aria-label="Document mode"><button class:selected={!editable} aria-pressed={!editable} onclick={() => editable = false}>View</button><button class:selected={editable} aria-pressed={editable} onclick={() => editable = true}>Edit</button></div>
    <label><span class="control-label">Width</span><select aria-label="Viewer width" value={width} onchange={resize}><option value="full">Full width</option><option value="360">360 px</option><option value="640">640 px</option><option value="960">960 px</option></select></label>
    {#if document}<label><span class="sr-only">Zoom</span><select aria-label="Zoom" bind:value={scale}>{#if ![0.5, 0.75, 1, 1.25].includes(scale)}<option value={scale}>{Math.round(scale * 100)}%</option>{/if}<option value={0.5}>50%</option><option value={0.75}>75%</option><option value={1}>100%</option><option value={1.25}>125%</option></select></label>{/if}
    <div class="document-actions"><button disabled={!original || loading} onclick={() => original && open(original, filename)}>Reset</button><button disabled={!output || loading} onclick={download}>Download <span aria-hidden="true">↓</span></button></div>
  </div>
  <div class="viewer-stage">
    <div class="viewer-frame" style:width={width === 'full' ? '100%' : `${width}px`}>
      {#if document}
        {#key revision}
          {#if document.kind === 'word'}<WordEditor session={document.session} {editable} bind:scale onchange={changed} onerror={message => error = message} ondownload={download} />
          {:else if document.kind === 'slides'}<PresentationEditor session={document.session} {editable} bind:scale onchange={changed} onerror={message => error = message} />
          {:else}<SheetEditor bind:scale initial={document.artifact} {editable} onchange={changed} onerror={message => error = message} />{/if}
        {/key}
      {:else}<div class="viewer-empty">{loading ? 'Opening sample…' : 'Open a document to begin.'}</div>{/if}
    </div>
  </div>
  <div class="workspace-status"><span class="filename" title={filename}>{filename || sample.file}</span><span aria-live="polite">{dirty ? 'Modified locally' : 'Local preview'}</span></div>
</div>
{#if error}<p class="playground-error" role="alert">{error}</p>{/if}
<div class="playground-footnote"><p>{sample.description}</p><p>DOCX / XLSX / PPTX · Up to 20 MB · <a href="/docs/compatibility#privacy">Files stay on your device</a></p></div>

<style>
  .playground-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .playground-heading h1 { font-size: 30px; margin-bottom: 0; }
  .quiet-link { color: var(--soft); font-size: 12px; }
  .playground-description { color: var(--soft); line-height: 1.7; margin: 15px 0 25px; }
  .playground-controls { display: flex; align-items: flex-end; gap: 14px; margin-bottom: 20px; }
  .sample-picker { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
  .control-label { font-size: 11px; color: var(--faint); }
  select { font-size: 12px; }
  .sample-picker select { min-width: 245px; }
  .file-actions { margin-left: auto; }
  .file-actions button { font-size: 12px; }
  .file-actions span { margin-left: 9px; }
  .workspace { border: 1px solid var(--border); border-radius: 7px; overflow: hidden; }
  .workspace-toolbar { min-height: 51px; background: var(--surface); display: flex; flex-wrap: wrap; align-items: center; padding: 8px 11px; gap: 14px; border-bottom: 1px solid var(--border); }
  .workspace-toolbar label { display: flex; align-items: center; gap: 8px; }
  .workspace-toolbar select { background: transparent; padding: 4px 6px; font-size: 11px; min-height: 28px; }
  .mode-switch { display: flex; padding: 2px; background: var(--bg); border-radius: 4px; border: 1px solid var(--border); }
  .mode-switch button { min-height: 25px; border: 0; border-radius: 3px; background: transparent; font-size: 11px; padding: 4px 11px; color: var(--faint); }
  .mode-switch button.selected { background: #29332c; color: var(--text); }
  .document-actions { margin-left: auto; display: flex; gap: 6px; }
  .document-actions button { min-height: 29px; font-size: 11px; padding: 4px 9px; }
  .document-actions span { margin-left: 5px; }
  .viewer-stage { min-width: 0; background: #101110; padding: 20px; }
  .viewer-frame { height: 640px; height: clamp(420px, 66vh, 820px); max-width: 100%; min-width: 260px; margin: 0 auto; resize: horizontal; overflow: hidden; border: 1px solid #333a35; }
  .viewer-empty { height: 100%; display: grid; place-items: center; color: var(--faint); }
  .workspace-status { display: flex; justify-content: space-between; align-items: center; gap: 12px; height: 33px; padding: 0 13px; border-top: 1px solid var(--border); color: var(--faint); font-size: 10px; }
  .filename { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .workspace-status > span:last-child { flex-shrink: 0; }
  .playground-error { color: var(--danger); font-size: 13px; line-height: 1.6; }
  .playground-footnote { color: var(--faint); display: flex; flex-wrap: wrap; justify-content: space-between; gap: 5px 20px; font-size: 11px; line-height: 1.7; padding-top: 10px; }
  .playground-footnote p { margin: 6px 0; }
  .playground-footnote a { text-decoration: underline; text-underline-offset: 3px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  @media(max-width: 760px) { .viewer-stage { padding: 8px; } .viewer-frame { min-width: 0; } .workspace-toolbar { gap: 8px; } .workspace-toolbar .control-label { display: none; } .document-actions { margin-left: 0; } .sample-picker select { min-width: 0; max-width: 215px; } .quiet-link { display: none; } }
</style>
