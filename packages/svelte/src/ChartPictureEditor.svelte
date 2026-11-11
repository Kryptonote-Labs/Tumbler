<script lang="ts">
  import { onDestroy } from 'svelte';
  import { canSetChartPicture, chartBytesToBase64, setChartPictureFill, editChartSource, type ChartContent, type ChartPropertyNode } from '@tumblerjs/charts';

  let { content, target, label, disabled = false, mode = 'row', onchange, onerror }: {
    content: ChartContent; target: ChartPropertyNode; label: string; disabled?: boolean; mode?: 'row' | 'action'; onchange: (content: ChartContent) => void; onerror?: ((message: string) => void) | undefined;
  } = $props();
  let input = $state<HTMLInputElement>(), busy = $state(false), error = $state<string>();
  let requested: { readonly content: ChartContent; readonly target: ChartPropertyNode } | undefined;
  let disposed = false;
  onDestroy(() => { disposed = true; });
  const errorId = $props.id();
  $effect(() => { void target; void content; error = undefined; });
  const capable = $derived(canSetChartPicture(target));
  const shape = $derived(target.name.split(':').at(-1) === 'spPr' ? target : target.children.find(child => child.name.split(':').at(-1) === 'spPr'));
  const fill = $derived(shape?.children.find(child => child.name.split(':').at(-1) === 'blipFill'));
  async function choose(file: File | undefined) {
    if (!file || disabled || busy) return;
    const request = requested; requested = undefined;
    const snapshot = request?.content ?? content, node = request?.target.id ?? target.id;
    busy = true; error = undefined;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (disposed || disabled) return;
      if (request && (request.target !== target || request.content !== content)) throw new Error('The document changed. Choose the picture again.');
      if (node !== target.id || content !== snapshot && (content.xml !== snapshot.xml || content.workbook !== snapshot.workbook || content.resources !== snapshot.resources)) throw new Error('The document changed. Choose the picture again.');
      const extension = file.name.split('.').at(-1)?.toLowerCase(), aliases: Readonly<Record<string, string>> = { jpg: 'jpeg', tif: 'tiff', emf: 'x-emf', wmf: 'x-wmf', svg: 'svg+xml' };
      const contentType = file.type || `image/${aliases[extension ?? ''] ?? extension ?? 'png'}`;
      if (!bytes.length) throw new Error('This picture is empty.');
      if (!contentType.startsWith('image/')) throw new Error('Choose an image file.');
      let next: ChartContent;
      try { next = setChartPictureFill(content, node, { data: chartBytesToBase64(bytes), contentType }); }
      catch { throw new Error('The picture could not be applied.'); }
      onchange(next);
    } catch (cause) { error = cause instanceof Error ? cause.message : 'The picture could not be applied.'; onerror?.(error); }
    finally { busy = false; if (input) input.value = ''; }
  }
  function remove() {
    if (!fill || disabled || busy) return;
    try { onchange({ ...content, xml: new TextDecoder().decode(editChartSource(new TextEncoder().encode(content.xml), [{ kind: 'remove', node: fill.id }])) }); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'The picture could not be removed.'; }
  }
</script>

{#if capable}
  <div class="picture-editor">
    <div class="row">{#if mode === 'row'}<span>Picture</span>{/if}<div class="actions" class:standalone={mode === 'action'}>
      <button type="button" {disabled} aria-disabled={busy} aria-label={`${fill ? 'Replace' : 'Choose'} picture for ${label}`} aria-describedby={error ? errorId : undefined} onclick={() => { if (!busy && !disabled) { requested = { content, target }; input?.click(); } }}>{mode === 'action' ? 'Picture…' : fill ? 'Replace…' : 'Choose…'}</button>
      {#if fill && mode === 'row'}<button class="remove" type="button" {disabled} aria-disabled={busy} aria-label={`Remove picture for ${label}`} title="Remove picture" onclick={remove}>×</button>{/if}
    </div></div>
    <input bind:this={input} type="file" accept="image/*,.emf,.wmf" hidden onchange={(event) => { void choose(event.currentTarget.files?.[0]); }} />
    {#if error}<p id={errorId} role="alert">{error}</p>{/if}
  </div>
{/if}

<style>
  .picture-editor { display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }
  .actions { display: flex; gap: 6px; width: 140px; }
  .actions.standalone { width: 100%; }
  .row:has(.standalone) { display: block; }
  button { box-sizing: border-box; flex: 1; min-width: 0; height: 28px; padding: 0 10px; font: inherit; color: inherit; cursor: pointer; background: var(--tumbler-control-bg, var(--surface, #181818)); border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  button:hover { background: var(--tumbler-control-hover, var(--surface-hover, #252825)); }
  button.remove { flex: 0 0 28px; padding: 0; font-size: 16px; }
  button:disabled, button[aria-disabled='true'] { opacity: .4; cursor: default; }
  button:focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
  p { margin: 0; font-size: 11px; color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); }
</style>
