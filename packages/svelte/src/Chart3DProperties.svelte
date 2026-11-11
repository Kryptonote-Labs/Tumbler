<script lang="ts">
  import type { Snippet } from 'svelte';
  import { CHART_BAR_SHAPES, chartPropertyTree, editChartSource, insertChartProperty, isOoxmlChartType, readChart3DProperties, type ChartPropertyNode } from '@tumblerjs/charts';
  import { chartPropertyChild as child, chartPropertyValue as value, setChartPropertyValue, type ChartPropertyLocator } from './chart-properties.ts';
  import ChartNumberField from './ChartNumberField.svelte';
  let { bytes, root, disabled = false, plotIndex = 0, onchange, onpreview, preview }: {
    bytes: Uint8Array; root: ChartPropertyNode; disabled?: boolean; plotIndex?: number; onchange: (bytes: Uint8Array) => void;
    onpreview?: (bytes: Uint8Array | undefined) => void; preview?: Snippet;
  } = $props();
  let current = $derived(bytes), error = $state<string>();
  const locatePlot: ChartPropertyLocator = root => child(child(root, 'chart'), 'plotArea')?.children.filter(node => isOoxmlChartType(node.name.split(':').at(-1) ?? ''))[plotIndex];
  const plot = $derived(locatePlot(root)), type = $derived(plot?.name.split(':').at(-1));
  const visible = $derived(type?.includes('3D') || type === 'surfaceChart');
  const viewState = $derived.by(() => {
    try { return { value: visible ? readChart3DProperties(current, plotIndex) : undefined, error: undefined }; }
    catch (cause) { return { value: undefined, error: cause instanceof Error ? cause.message : 'The 3-D view could not be read.' }; }
  });
  const resolved = $derived(viewState.value), view = $derived(resolved?.threeD);
  const shapes = { box: 'Box', cylinder: 'Cylinder', cone: 'Cone', coneToMax: 'Cone to axis maximum', pyramid: 'Pyramid', pyramidToMax: 'Pyramid to axis maximum' } as const;
  const shape = $derived.by(() => {
    const fallback = value(child(plot, 'shape')) ?? 'box';
    const choices = new Set(plot?.children.filter(node => node.name.split(':').at(-1) === 'ser').map(series => { const override = child(series, 'shape'); return override ? value(override) ?? 'box' : fallback; }));
    return choices.size > 1 ? 'mixed' : choices.values().next().value ?? fallback;
  });
  const fields = [
    { name: 'rotY', label: 'Rotation °', key: 'rotationY', definition: 'c:CT_RotY/c:rotY', min: 0, max: 360 },
    { name: 'rotX', label: 'Tilt °', key: 'rotationX', definition: 'c:CT_RotX/c:rotX', min: -90, max: 90 },
    { name: 'hPercent', label: 'Height %', key: 'heightPercent', definition: 'c:CT_HPercent/c:hPercent', min: 5, max: 500, empty: 'Automatic' },
    { name: 'depthPercent', label: 'Depth %', key: 'depthPercent', definition: 'c:CT_DepthPercent/c:depthPercent', min: 20, max: 2000, empty: 'Default' },
  ] as const;
  const locateView: ChartPropertyLocator = root => child(child(root, 'chart'), 'view3D');
  function transform(name: string, definition: string, next: string | undefined, plot = false) {
    let source = current;
    if (!plot && !locateView(chartPropertyTree(source))) {
      const owner = child(chartPropertyTree(source), 'chart');
      if (!owner) throw Error('This chart has no 3-D view.');
      source = insertChartProperty(source, owner.id, 'c:CT_View3D/c:view3D');
    }
    source = setChartPropertyValue(source, plot ? locatePlot : locateView, name, definition, next);
    if (plot && name === 'shape') {
      const overrides = locatePlot(chartPropertyTree(source))?.children.flatMap(series => series.name.split(':').at(-1) === 'ser' ? series.children.filter(node => node.name.split(':').at(-1) === 'shape') : []) ?? [];
      if (overrides.length) source = editChartSource(source, overrides.map(node => ({ kind: 'remove', node: node.id })));
    }
    return source;
  }
  function set(name: string, definition: string, next: string | undefined, plot = false) {
    try { const source = transform(name, definition, next, plot); onchange(source); current = source; error = undefined; onpreview?.(undefined); return true; }
    catch (cause) { error = cause instanceof Error ? cause.message : 'This property could not be changed.'; return false; }
  }
  function draft(name: string, definition: string, next: number | undefined, plot = false) {
    try { onpreview?.(transform(name, definition, next === undefined ? undefined : String(next), plot)); } catch { onpreview?.(undefined); }
  }
</script>

{#if visible && view}
  <fieldset {disabled} class="view">
    <legend>3-D view</legend>
    {#if preview}<div class="preview">{@render preview()}</div>{/if}
    {#if type === 'bar3DChart'}
      <label><span>Shape</span><select class="tumbler-select" value={shape} onchange={(event) => set('shape', 'c:CT_Shape/c:shape', event.currentTarget.value, true)}>
        {#if shape === 'mixed'}<option value="mixed" disabled>Mixed</option>{/if}
        {#each CHART_BAR_SHAPES as shape}<option value={shape}>{shapes[shape]}</option>{/each}
      </select></label>
    {/if}
    {#each fields as field}
      {#if type !== 'pie3DChart' || (field.name !== 'depthPercent' && field.name !== 'hPercent')}
        <ChartNumberField label={field.label} value={view[field.key]} min={field.min} max={field.max} {disabled} empty={'empty' in field ? field.empty : undefined}
          oncommit={(next) => set(field.name, field.definition, next === undefined ? undefined : String(next))} onpreview={(next) => draft(field.name, field.definition, next)} onendpreview={() => onpreview?.(undefined)} />
      {/if}
    {/each}
    {#if type !== 'pie3DChart'}
      <label><span>Right-angle axes</span><input type="checkbox" checked={view.rightAngleAxes} onchange={(event) => set('rAngAx', 'c:CT_Boolean/c:rAngAx', event.currentTarget.checked ? '1' : '0')} /></label>
    {/if}
    <ChartNumberField label="Perspective" value={view.perspective} min={0} max={240} disabled={disabled || (type !== 'pie3DChart' && view.rightAngleAxes)}
      oncommit={(next) => set('perspective', 'c:CT_Perspective/c:perspective', String(next))} onpreview={(next) => draft('perspective', 'c:CT_Perspective/c:perspective', next)} onendpreview={() => onpreview?.(undefined)} />
    {#if type !== 'pie3DChart'}
      {#if ['bar3DChart', 'area3DChart', 'line3DChart'].includes(type ?? '')}
        <ChartNumberField label="Depth gap %" value={resolved?.gapDepth} min={0} max={500} {disabled}
          oncommit={(next) => set('gapDepth', 'c:CT_GapAmount/c:gapDepth', String(next), true)} onpreview={(next) => draft('gapDepth', 'c:CT_GapAmount/c:gapDepth', next, true)} onendpreview={() => onpreview?.(undefined)} />
      {/if}
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </fieldset>
{/if}
{#if viewState.error}<p role="alert">{viewState.error}</p>{/if}

<style>
  .view { display: flex; flex-direction: column; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0; font-size: 12px; }
  legend { padding: 0; margin-bottom: 8px; font-weight: 550; }
  label { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }
  select { box-sizing: border-box; height: 28px; min-width: 0; width: 140px; padding: 3px 6px; font: inherit; color: inherit; background: var(--tumbler-control-bg, var(--surface, #181818)); border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  :is(select, input):focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
  select:disabled { opacity: .4; }
  .preview { height: 160px; overflow: hidden; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  p { margin: 0; color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); font-size: 11px; }
</style>
