<script lang="ts">
  import { onMount } from 'svelte';
  import Code from '$lib/components/Code.svelte';
  import WordPreview from '$lib/components/showcase/WordPreview.svelte';
  import GridPreview from '$lib/components/showcase/GridPreview.svelte';
  import FormulaPreview from '$lib/components/showcase/FormulaPreview.svelte';
  import ToolbarPreview from '$lib/components/showcase/ToolbarPreview.svelte';
  import SlidePreview from '$lib/components/showcase/SlidePreview.svelte';
  import ChartPreview from '$lib/components/showcase/ChartPreview.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let selected = $state('word');
  let revision = $state(0);
  let word = $state<Uint8Array>();
  let slides = $state<Uint8Array>();
  let sheet = $state<Uint8Array>();
  let error = $state('');
  let loading = $state(true);
  let example = $derived(data.examples.find(item => item.id === selected) ?? data.examples[0]!);

  async function loadSamples(signal?: AbortSignal) {
    loading = true; error = '';
    try {
      const bytes = await Promise.all(['project-brief.docx', 'project-budget.xlsx', 'workspace-brief.pptx'].map(async file => {
        const response = await fetch(`/samples/${file}`, { signal });
        if (!response.ok) throw new Error('Sample unavailable');
        return new Uint8Array(await response.arrayBuffer());
      }));
      [word, sheet, slides] = bytes;
    } catch { if (!signal?.aborted) error = 'Could not load the sample files.'; }
    finally { if (!signal?.aborted) loading = false; }
  }
  onMount(() => {
    const controller = new AbortController();
    void loadSamples(controller.signal);
    return () => controller.abort();
  });
</script>

<svelte:head><title>Components · Tumbler</title><meta name="description" content="Try Tumbler's Svelte components individually, inspect their props, and copy working examples." /></svelte:head>
<article class="components-page">
  <h1>Components</h1>
  <p class="lead">Try the Svelte components on their own. Each preview runs the source shown below it.</p>
  <nav class="component-picker" aria-label="Choose a component">
    {#each data.examples as item}<button aria-pressed={selected === item.id} onclick={() => selected = item.id}>{item.name}</button>{/each}
  </nav>
  <section aria-labelledby="component-title">
    <h2 id="component-title">{example.name}</h2>
    <p>{example.description}</p>
    <div class="preview">
      <div class="preview-header"><span>Preview</span><button onclick={() => revision++} disabled={loading && selected !== 'chart'}>Reset example</button></div>
      <p class="preview-hint">{example.hint}{#if selected === 'word'} <a href="/playground/word-brief">Open playground →</a>{/if}</p>
      <div class="preview-body editor-root">
        {#key `${selected}-${revision}`}
          {#if selected === 'chart'}<ChartPreview />
          {:else if loading}<p role="status">Loading sample…</p>
          {:else if error}<p role="alert">{error}</p><button onclick={() => loadSamples()}>Retry</button>
          {:else if selected === 'slides' && slides}<SlidePreview bytes={slides} />
          {:else if selected === 'word' && word}<WordPreview bytes={word} />
          {:else if selected === 'grid' && sheet}<GridPreview bytes={sheet} />
          {:else if selected === 'formula' && sheet}<FormulaPreview bytes={sheet} />
          {:else if selected === 'toolbar' && sheet}<ToolbarPreview bytes={sheet} />{/if}
        {/key}
      </div>
    </div>
    <h3>Usage</h3>
    {#if selected !== 'chart'}<p>Pass the original {selected === 'word' ? 'DOCX' : selected === 'slides' ? 'PPTX' : 'XLSX'} file as <code>bytes: Uint8Array</code>. Changes in this example stay in memory; Reset restores the sample.</p>{/if}
    <Code code={example.code} html={example.html} language="Svelte" />
    <h3>Key props</h3>
    <div class="table-wrap"><table><thead><tr><th>Prop</th><th>Purpose</th></tr></thead><tbody>{#each example.props as [name, description]}<tr><td><code>{name}</code></td><td>{description}</td></tr>{/each}</tbody></table></div>
    <a class="doc-next" href={example.href}>Integration guide <span aria-hidden="true">→</span></a>
  </section>
</article>

<style>
  .components-page { max-width: 900px; margin: 0 auto; }
  .component-picker { display: flex; flex-wrap: wrap; gap: 6px; padding-bottom: 22px; border-bottom: 1px solid var(--border); }
  .component-picker button { font-size: 12px; color: var(--soft); }
  .component-picker button[aria-pressed='true'] { background: #1d2820; border-color: #45634e; color: var(--text); }
  .preview { border: 1px solid var(--border); border-radius: 7px; overflow: hidden; margin: 22px 0 30px; }
  .preview-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--border); font-size: 12px; color: var(--soft); }
  .preview-header button { font-size: 12px; }
  .preview-hint { font-size: 13px; padding: 0 16px; }
  .preview-body { height: auto; padding: 4px 16px 16px; }
  td:first-child { width: 30%; }
  td code { white-space: normal; overflow-wrap: anywhere; }
  @media (max-width: 760px) { .preview-body { padding: 4px 8px 8px; } .component-picker button { font-size: 11px; } }
</style>
