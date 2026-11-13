<script lang="ts">
  import PageEnd from '$lib/components/PageEnd.svelte';
  import { componentDocs } from '$lib/examples/components';
</script>

<svelte:head><title>Components · Tumbler</title><meta name="description" content="Reference for Tumbler's Svelte components, each with a live example and its source." /></svelte:head>
<div class="doc-layout no-contents">
  <article class="doc">
    <header class="doc-header">
      <h1>Components</h1>
      <p class="lead">Svelte components for displaying and editing Word, Excel and PowerPoint files. Each page has a live example, its source and its main props.</p>
    </header>
    <div class="table-wrap">
      <table class="component-index">
        <thead><tr><th>Component</th><th>Import from</th><th>What it does</th></tr></thead>
        <tbody>
          {#each componentDocs as doc}
            <tr><td><a href={`/components/${doc.slug}`}><code>{doc.name}</code></a></td><td><code>{doc.module}</code></td><td>{doc.summary}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <PageEnd source="apps/docs/src/lib/examples/components.ts" />
  </article>
</div>

<style>
  .component-index td:first-child code { color: var(--text); }
  /* The name is the row's link: underline it like prose links, accent on hover. */
  .component-index td:first-child a { text-decoration: underline; text-decoration-color: var(--border-strong); text-underline-offset: 4px; }
  .component-index td:first-child a:hover code { color: var(--accent); }
  .component-index td:nth-child(-n + 2) code { white-space: nowrap; font-size: 13px; }
  /* Narrow screens: one block per component instead of a squeezed three-column table. */
  @media (max-width: 760px) {
    .component-index thead { display: none; }
    .component-index tr { display: grid; gap: 4px; padding: 12px 0; border-bottom: 1px solid var(--border); }
    .component-index td { border: 0; padding: 0; }
  }
</style>
