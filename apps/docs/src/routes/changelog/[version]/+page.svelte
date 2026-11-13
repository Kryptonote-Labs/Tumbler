<script lang="ts">
  import PageEnd from '$lib/components/PageEnd.svelte';
  let { data } = $props();
</script>

<svelte:head><title>{data.release.version} · Changelog · Tumbler</title><meta name="description" content={data.release.summary} /></svelte:head>
<div class="doc-layout">
  <article class="doc">
    <header class="doc-header">
      <h1>{data.release.version}</h1>
      <p class="lead">{data.release.summary}</p>
    </header>
    <p><time datetime={data.release.date}>{data.dateLabel}</time>{#if data.release.partial} · Partial publication{/if}</p>
    <h2 id="changes">Changes</h2>
    <ul>{#each data.release.changes as change}<li>{change}</li>{/each}</ul>
    <h2 id="sources">Release sources</h2>
    {#if data.sourceUrl}<p><a href={data.sourceUrl}>Source changes on GitHub</a></p>{/if}
    <p><a href={data.registryUrl}>Registry publication and package metadata</a></p>
    <p><a href="/docs/installation">Install the current release</a></p>
    <PageEnd previous={{ href: '/changelog', label: 'Changelog' }} />
  </article>
  <nav class="contents" aria-label="On this page"><p>On this page</p><a href="#changes">Changes</a><a href="#sources">Release sources</a></nav>
</div>
