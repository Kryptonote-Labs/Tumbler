<script lang="ts">
  let { label, value, min, max, disabled = false, empty, oncommit, onpreview, onendpreview }: {
    label: string; value: number | undefined; min: number; max: number; disabled?: boolean; empty?: string;
    oncommit: (value: number | undefined) => boolean;
    onpreview: (value: number | undefined) => void; onendpreview: () => void;
  } = $props();
  const text = () => value === undefined ? '' : String(value);
  function normalized(input: HTMLInputElement) {
    if (!input.value) return empty ? undefined : value;
    const next = Math.round(input.valueAsNumber);
    return Number.isFinite(next) ? Math.max(min, Math.min(max, next)) : value;
  }
  function commit(input: HTMLInputElement) {
    const next = normalized(input);
    if (next === value || !oncommit(next)) input.value = text();
    else input.value = next === undefined ? '' : String(next);
    onendpreview();
  }
</script>
<label><span>{label}</span><input class="tumbler-input" type="number" {min} {max} step="1" {disabled} placeholder={empty} {value}
  oninput={(event) => onpreview(normalized(event.currentTarget))} onblur={(event) => commit(event.currentTarget)}
  onkeydown={(event) => {
    if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
    else if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.value = text(); onendpreview(); event.currentTarget.blur(); }
  }} /></label>
<style>
  label { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }
  input { box-sizing: border-box; height: 28px; min-width: 0; width: 140px; padding: 3px 6px; font: inherit; color: inherit; background: var(--tumbler-control-bg, var(--surface, #181818)); border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  input:focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
  input:disabled { opacity: .4; }
</style>
