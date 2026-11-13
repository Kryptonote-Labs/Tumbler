<!--
  A running example beside the exact source that produces it. Side by side when the
  container is wide enough, stacked otherwise (container query, not viewport).
-->
<script lang="ts">
  import Code from '$lib/components/Code.svelte';
  import ExamplePreview from './ExamplePreview.svelte';
  import { examples, type ExampleId } from '$lib/examples/registry';

  let { id, html }: { id: ExampleId; html: string } = $props();
  const example = $derived(examples[id]);
  let revision = $state(0);
</script>

<div class="live-example" data-example={id} role="group" aria-label={`Live example: ${example.file}`}>
  <div class="live-inner">
  <div class="live-preview">
    <div class="pane-bar">
      <span>Preview</span>
      <button onclick={() => revision++} aria-label="Reset example">Reset</button>
    </div>
    <div class="live-stage editor-root" style:min-height={`${example.height}px`}>
      {#key revision}<ExamplePreview {example} />{/key}
    </div>
    <p class="hint">{example.hint}</p>
  </div>
  <div class="live-source">
    <Code code={example.source} {html} language="Svelte" title={example.file} />
  </div>
  </div>
</div>

<style>
  .live-example { container-type: inline-size; margin: 20px 0 24px; }
  .live-inner { display: grid; grid-template-columns: minmax(0, 1fr); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--surface); }
  .live-preview { display: flex; flex-direction: column; min-width: 0; }
  .pane-bar { height: 36px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 6px 0 14px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--faint); }
  .pane-bar button { min-height: 26px; padding: 3px 8px; font-size: 12px; color: var(--soft); border-color: transparent; background: transparent; }
  .pane-bar button:hover { color: var(--text); border-color: var(--border-strong); background: var(--hover); }
  .live-stage { flex: 1; height: auto; padding: 16px; font-size: 13px; color: var(--soft); }
  .live-stage :global(label) { font-size: 13px; }
  .live-stage :global(select) { min-height: 28px; padding: 3px 8px; }
  .hint { margin: 0; flex: none; padding: 10px 14px; border-top: 1px solid var(--border); font-size: 13px; line-height: 1.5; color: var(--faint); }
  .live-source { position: relative; min-width: 0; border-top: 1px solid var(--border); background: var(--code-bg); }
  .live-source :global(.code-block) { margin: 0; border: 0; border-radius: 0; background: transparent; }
  .live-source :global(pre) { max-height: 420px; }
  /* Side by side only when each pane fits a 4-column grid and ~65-column source lines. */
  @container (min-width: 1060px) {
    .live-inner { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .live-source { border-top: 0; border-left: 1px solid var(--border); }
    /* The row grows with the source up to 620px, so the component markup is in view. */
    .live-source :global(.code-block) { height: 100%; display: flex; flex-direction: column; }
    .live-source :global(.code-caption) { flex: none; }
    .live-source :global(pre) { flex: 1; max-height: 584px; }
  }
</style>
