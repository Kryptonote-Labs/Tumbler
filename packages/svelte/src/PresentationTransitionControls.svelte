<script lang="ts">
  import { SLIDE_TRANSITIONS, slideTransitionKinds, isSlideTransitionKind, ORIENTED_TRANSITIONS, type PresentationSlide, type PresentationCommand, type SlideTransitionInput, slideTransition } from '@tumblerjs/slides';
  let { slide, oncommand, disabled = false }: {
    slide: PresentationSlide;
    oncommand: (command: Extract<PresentationCommand, { name: 'set-transition' }>) => void;
    disabled?: boolean;
  } = $props();
  const current = $derived(slide.transition);
  const kind = $derived(current && isSlideTransitionKind(current.kind) ? current.kind : undefined);
  const definition = $derived(kind ? SLIDE_TRANSITIONS[kind] : undefined);
  function choose(value: string) {
    oncommand({ name: 'set-transition', slideId: slide.id, transition: isSlideTransitionKind(value) ? {
      kind: value, duration: current?.duration ?? 750, advanceOnClick: current?.advanceOnClick ?? true,
      ...(current?.advanceAfter === undefined ? {} : { advanceAfter: current.advanceAfter }),
    } : null });
  }
  function change(patch: Partial<SlideTransitionInput>, removeAdvance = false) {
    if (!kind) return;
    // Only author known fields, without carrying unsupported imported options into a new effect.
    const input: SlideTransitionInput = { kind, duration: current!.duration, advanceOnClick: current!.advanceOnClick };
    const allowed = {
      direction: definition!.directions.length ? current!.direction : undefined,
      orientation: (ORIENTED_TRANSITIONS as readonly string[]).includes(kind) ? current!.orientation : undefined,
      throughBlack: ['cut', 'fade', 'reveal'].includes(kind) ? current!.throughBlack : undefined,
      spokes: ['wheel', 'wheelReverse'].includes(kind) ? current!.spokes : undefined,
      pattern: ['glitter', 'shred'].includes(kind) ? current!.pattern : undefined,
      bounce: kind === 'flythrough' ? current!.bounce : undefined,
      content: kind === 'prism' ? current!.content : undefined,
      inverted: kind === 'prism' ? current!.inverted : undefined,
      invertX: definition!.family === '2012' ? current!.invertX : undefined,
      invertY: definition!.family === '2012' ? current!.invertY : undefined,
      advanceAfter: removeAdvance ? undefined : current!.advanceAfter,
    };
    // Validate the imported fields before exposing them to the shared command schema.
    const candidate = { ...input, ...Object.fromEntries(Object.entries(allowed).filter(([, value]) => value !== undefined)), ...patch };
    oncommand({ name: 'set-transition', slideId: slide.id, transition: slideTransition.parse(candidate) });
  }
  const directionNames: Readonly<Record<string, string>> = { l: 'Left', r: 'Right', u: 'Up', d: 'Down', lu: 'Top left', ru: 'Top right', ld: 'Bottom left', rd: 'Bottom right', in: 'In', out: 'Out', center: 'Center' };
</script>

<details class="transition-controls">
  <summary>Transition</summary>
  <fieldset {disabled}>
    <label>Effect <select aria-label="Slide transition" value={current?.kind ?? 'none'} onchange={e => choose(e.currentTarget.value)}>
      <option value="none">None</option>
      {#if current && !kind}<option value={current.kind} disabled>{current.kind} (preserved)</option>{/if}
      {#each ['standard', '2010', '2012'] as family}
        <optgroup label={family === 'standard' ? 'Classic' : `PowerPoint ${family}`}>
          {#each slideTransitionKinds.filter(k => SLIDE_TRANSITIONS[k].family === family) as item}
            <option value={item}>{SLIDE_TRANSITIONS[item].label}</option>
          {/each}
        </optgroup>
      {/each}
    </select></label>
    {#if kind && current && definition}
      <label>Duration <input aria-label="Transition duration in seconds" type="number" min="0" step="0.1" value={current.duration / 1000} onchange={e => { if (e.currentTarget.validity.valid && e.currentTarget.value !== '') change({ duration: Math.round(e.currentTarget.valueAsNumber * 1000) }); }} /> s</label>
      {#if definition.directions.length}
        <label>Direction <select value={current.direction} onchange={e => change({ direction: e.currentTarget.value as SlideTransitionInput['direction'] })}>
          {#each definition.directions as direction}<option value={direction}>{directionNames[direction]}</option>{/each}
        </select></label>
      {/if}
      {#if (ORIENTED_TRANSITIONS as readonly string[]).includes(kind)}
        <label>Orientation <select value={current.orientation ?? 'horz'} onchange={e => change({ orientation: e.currentTarget.value === 'vert' ? 'vert' : 'horz' })}><option value="horz">Horizontal</option><option value="vert">Vertical</option></select></label>
      {/if}
      {#if ['cut', 'fade', 'reveal'].includes(kind)}<label><input type="checkbox" checked={current.throughBlack ?? false} onchange={e => change({ throughBlack: e.currentTarget.checked })} /> Through black</label>{/if}
      {#if ['wheel', 'wheelReverse'].includes(kind)}<label>Spokes <select value={current.spokes ?? 1} onchange={e => change({ spokes: Number(e.currentTarget.value) as 1 | 2 | 3 | 4 | 8 })}>{#each [1, 2, 3, 4, 8] as spokes}<option value={spokes}>{spokes}</option>{/each}</select></label>{/if}
      {#if kind === 'glitter' || kind === 'shred'}<label>Pattern <select value={current.pattern ?? (kind === 'glitter' ? 'diamond' : 'strip')} onchange={e => change({ pattern: e.currentTarget.value as SlideTransitionInput['pattern'] })}>{#each kind === 'glitter' ? ['diamond', 'hexagon'] : ['strip', 'rectangle'] as pattern}<option value={pattern}>{pattern}</option>{/each}</select></label>{/if}
      {#if kind === 'flythrough'}<label><input type="checkbox" checked={current.bounce ?? false} onchange={e => change({ bounce: e.currentTarget.checked })} /> Bounce</label>{/if}
      {#if kind === 'prism'}
        <label><input type="checkbox" checked={current.content ?? false} onchange={e => change({ content: e.currentTarget.checked })} /> Rotate content</label>
        <label><input type="checkbox" checked={current.inverted ?? false} onchange={e => change({ inverted: e.currentTarget.checked })} /> Reverse rotation</label>
      {/if}
      {#if definition.family === '2012'}
        <label><input type="checkbox" checked={current.invertX ?? false} onchange={e => change({ invertX: e.currentTarget.checked })} /> Flip horizontally</label>
        <label><input type="checkbox" checked={current.invertY ?? false} onchange={e => change({ invertY: e.currentTarget.checked })} /> Flip vertically</label>
      {/if}
      <label><input type="checkbox" checked={current.advanceOnClick} onchange={e => change({ advanceOnClick: e.currentTarget.checked })} /> Advance on click</label>
      <label><input type="checkbox" checked={current.advanceAfter !== undefined} onchange={e => e.currentTarget.checked ? change({ advanceAfter: 5000 }) : change({}, true)} /> Advance after</label>
      <label><input aria-label="Slide advance delay in seconds" type="number" min="0" max="4294967.295" step="0.1" disabled={current.advanceAfter === undefined} value={(current.advanceAfter ?? 5000) / 1000} onchange={e => { if (e.currentTarget.validity.valid && e.currentTarget.value !== '') change({ advanceAfter: Math.round(e.currentTarget.valueAsNumber * 1000) }); }} /> s</label>
    {/if}
  </fieldset>
</details>

<style>
  .transition-controls { font: inherit; }
  summary { cursor: pointer; padding: 6px 0; }
  fieldset { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin: 0; padding: 8px 0; border: 0; }
  label { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
  select, input { font: inherit; color: inherit; }
  select, input[type='number'] { background: var(--tumbler-control-bg, var(--surface, #202124)); border: 1px solid var(--tumbler-control-border, var(--border, #555)); border-radius: 4px; padding: 4px 6px; }
  input[type='number'] { width: 76px; }
</style>
