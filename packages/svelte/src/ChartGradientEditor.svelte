<script lang="ts">
  import { onDestroy, tick, untrack, type Snippet } from 'svelte';
  import { editChartGradientFill, mergeChartFillDraft, readChartGradientFill, type ChartContent, type ChartGradientEdit, type ChartGradientType, type ChartPropertyNode } from '@tumblerjs/charts';
  import ChartFillColor from './ChartFillColor.svelte';
  import ChartGradientStops from './ChartGradientStops.svelte';
  import { chartGradientStopAt } from './chart-gradient-ramp.ts';
  let { content, target, targetKey, label, themeColors, disabled = false, open = $bindable(false), showTrigger = true, preview, onpreview, onchange, onclose }: {
    content: ChartContent; target: ChartPropertyNode; targetKey: string; label: string; themeColors: Readonly<Record<string, string>>; disabled?: boolean; open?: boolean; showTrigger?: boolean;
    preview?: Snippet | undefined; onpreview?: ((bytes: Uint8Array | undefined) => void) | undefined; onchange: (content: ChartContent) => void; onclose?: () => void;
  } = $props();
  const id = $props.id();
  let trigger = $state<HTMLButtonElement>(), popup = $state<HTMLDivElement>(), stopEditor = $state<{ focusSelected(): Promise<void> }>();
  let draft = $state<Uint8Array>(), original = $state<Uint8Array>(), owner = $state(0), selected = $state(0), keys = $state<string[]>([]), error = $state<string>();
  let sessionKey = untrack(() => targetKey), lastAngle = 90, frame: number | undefined;
  const source = $derived(new TextEncoder().encode(content.xml));
  const bytes = $derived(draft ?? source);
  const gradient = $derived.by(() => { try { return readChartGradientFill(bytes, draft ? owner : target.id); } catch { return undefined; } });
  const current = $derived(gradient?.stops[selected]);
  const rebased = $derived.by(() => {
    if (!open || !original || !draft) return {};
    try { return { bytes: mergeChartFillDraft({ bytes: source, node: target.id }, { bytes: original, node: owner }, { bytes: draft, node: owner }) }; }
    catch (cause) { return { error: cause instanceof Error ? cause.message : 'This fill changed. Discard and reload to continue.' }; }
  });
  $effect(() => { const key = targetKey; untrack(() => { if (key !== sessionKey) { sessionKey = key; close(false); } }); });
  $effect(() => { if (disabled && open) untrack(() => close(false)); });
  $effect(() => { if (open && !draft) untrack(begin); else if (!open && draft) untrack(() => close(false)); });
  $effect(() => {
    const next = rebased.bytes;
    if (open && next) frame = requestAnimationFrame(() => { frame = undefined; onpreview?.(next); });
    else onpreview?.(undefined);
    return () => { if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined; };
  });
  onDestroy(() => { if (frame !== undefined) cancelAnimationFrame(frame); onpreview?.(undefined); });
  function close(restore = true) {
    if (frame !== undefined) cancelAnimationFrame(frame); frame = undefined;
    open = false; draft = undefined; original = undefined; error = undefined; onpreview?.(undefined);
    if (restore) { if (trigger) trigger.focus(); else onclose?.(); }
  }
  function begin() {
    original = source; owner = target.id; selected = 0; error = undefined;
    try {
      draft = editChartGradientFill(original, owner, { kind: 'settings' });
      const parsed = readChartGradientFill(draft, owner)!; lastAngle = parsed.angle;
      keys = parsed.stops.map(() => crypto.randomUUID());
      void tick().then(() => { popup?.querySelector<HTMLSelectElement>('select')?.focus(); popup?.scrollIntoView({ block: 'nearest' }); });
    } catch (cause) { draft = original; error = cause instanceof Error ? cause.message : 'The gradient could not be opened.'; }
  }
  function run(edit: ChartGradientEdit) {
    if (!open || disabled || !gradient) return;
    try {
      const before = gradient;
      if (edit.kind === 'settings') {
        if (before.type === 'linear') lastAngle = before.angle;
        if (edit.type === 'linear' && before.type !== 'linear' && edit.angle === undefined) edit = { ...edit, angle: lastAngle };
      }
      draft = editChartGradientFill(bytes, owner, edit); error = undefined;
      if (edit.kind === 'add') { const count = readChartGradientFill(draft, owner)!.stops.length; keys = [...keys, ...Array.from({ length: count - before.stops.length }, () => crypto.randomUUID())]; selected = count - 1; }
      if (edit.kind === 'remove') { const node = edit.node, index = before.stops.findIndex(stop => stop.node === node); keys = keys.filter((_, i) => i !== index); selected = Math.min(index, keys.length - 1); void stopEditor?.focusSelected(); }
    } catch (cause) { error = cause instanceof Error ? cause.message : 'The gradient could not be changed.'; }
  }
  function stop(edit: Omit<Extract<ChartGradientEdit, { kind: 'stop' }>, 'kind' | 'node'>) { if (current) run({ kind: 'stop', node: current.node, ...edit }); }
  function add(position = .5) { run({ kind: 'add', position, ...chartGradientStopAt(gradient?.stops ?? [], themeColors, position) }); }
  function apply() {
    if (disabled || !gradient || !rebased.bytes) return;
    const xml = new TextDecoder().decode(rebased.bytes);
    if (xml !== content.xml) onchange({ ...content, xml });
    close();
  }
</script>
<div class="gradient-editor">
  {#if showTrigger}<div class="row"><span>Gradient</span><button bind:this={trigger} type="button" {disabled} aria-expanded={open} aria-haspopup="dialog" aria-controls={id} aria-label={`Edit gradient for ${label}`} onclick={() => { if (!open) open = true; else popup?.querySelector<HTMLSelectElement>('select')?.focus(); }}>Edit…</button></div>{/if}
  {#if open}
    <div bind:this={popup} {id} class="popup" role="dialog" aria-label={`Gradient for ${label}`} tabindex="-1" onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <div class="buttons footer"><button type="button" onclick={() => close()}>Cancel</button><button type="button" disabled={disabled || !gradient || !rebased.bytes} onclick={apply}>Apply</button></div>
      {#if rebased.error}<p role="alert">{rebased.error} <button type="button" onclick={begin}>Discard and reload</button></p>{/if}
      {#if error}<p role="alert">{error}</p>{/if}
      {#if gradient}
        {#if preview}<div class="preview">{@render preview()}</div>{/if}
        <label class="row"><span>Type</span><select {disabled} aria-label={`Gradient type for ${label}`} value={gradient.type} onchange={(event) => run({ kind: 'settings', type: event.currentTarget.value as ChartGradientType })}><option value="linear">Linear</option><option value="circle">Circular</option><option value="rect">Rectangular</option>{#if gradient.type === 'shape'}<option value="shape">Shape</option>{/if}</select></label>
        {#if gradient.type === 'linear'}<label class="row"><span>Angle</span><input type="number" {disabled} step="1" aria-label={`Gradient angle for ${label}`} value={gradient.angle} onchange={(event) => { if (event.currentTarget.value !== '' && event.currentTarget.validity.valid) run({ kind: 'settings', angle: event.currentTarget.valueAsNumber }); }} /></label>{/if}
        <ChartGradientStops bind:this={stopEditor} stops={gradient.stops} {keys} bind:selected {label} {themeColors} {disabled} onposition={(index, position) => { selected = index; stop({ position }); }} onadd={add} onremove={(index) => { const item = gradient?.stops[index]; if (item) run({ kind: 'remove', node: item.node }); }} />
        {#if current}
          <label class="row"><span>Position</span><input type="number" {disabled} min="0" max="100" step="0.1" aria-label={`Gradient stop position for ${label}`} value={Math.round(current.position * 10000) / 100} onchange={(event) => { if (event.currentTarget.value !== '' && event.currentTarget.validity.valid) stop({ position: event.currentTarget.valueAsNumber / 100 }); }} /></label>
          <ChartFillColor label="Colour" target={`${label} gradient stop ${selected + 1}`} color={current.color ?? { kind: 'scheme', value: 'accent1' }} unresolved={!current.color} {themeColors} {disabled} onchange={(color) => stop({ color })} />
          <label class="row"><span>Opacity</span><input type="number" {disabled} min="0" max="100" step="1" aria-label={`Gradient stop opacity for ${label}`} value={Math.round(current.opacity * 10000) / 100} onchange={(event) => { if (event.currentTarget.value !== '' && event.currentTarget.validity.valid) stop({ opacity: event.currentTarget.valueAsNumber / 100 }); }} /></label>
        {/if}
          <div class="buttons"><button type="button" {disabled} onclick={() => add()}>Add stop</button><button type="button" disabled={disabled || gradient.stops.length <= 2} onclick={() => current && run({ kind: 'remove', node: current.node })}>Remove stop</button></div>
      {/if}
    </div>
  {/if}
</div>
<style>
  .gradient-editor, .popup { display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }
  button, input, select { box-sizing: border-box; min-width: 0; height: 28px; padding: 0 8px; font: inherit; color: inherit; background: var(--tumbler-control-bg, var(--surface, #181818)); border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  .row > :last-child { width: 140px; } button { cursor: pointer; } input { padding-right: 2px; }
  .popup { max-height: min(520px, 70vh); overflow: auto; padding: 6px; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  .preview { flex: 0 0 160px; overflow: hidden; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); }
  .preview :global(svg) { display: block; width: 100%; height: 100%; }
  .buttons { display: flex; gap: 6px; }.buttons > button { flex: 1; }
  .footer { position: sticky; top: -6px; z-index: 2; padding: 6px 0; margin-top: -6px; background: var(--tumbler-control-bg, var(--surface, #181818)); }
  button:hover:enabled { background-color: var(--tumbler-control-hover, var(--surface-hover, #252825)); }
  button:disabled, input:disabled, select:disabled { opacity: .4; cursor: default; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
  p { margin: 0; font-size: 11px; color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); }
</style>
