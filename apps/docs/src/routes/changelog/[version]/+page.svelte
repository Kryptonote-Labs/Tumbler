<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>{data.release.version} · Changelog · Tumbler</title><meta name="description" content={data.release.summary} /></svelte:head>
<div class="doc-layout">
  <article>
    <p class="eyebrow"><a href="/changelog">Back to changelog</a></p>
    <h1>{data.release.version}</h1>
    <p><time datetime={data.release.date}>{data.dateLabel}</time>{#if data.release.partial} · Partial publication{/if}</p>
    <p class="lead">{data.release.summary}</p>
    <h2 id="changes">Changes</h2>
    <ul>{#each data.release.changes as change}<li>{change}</li>{/each}</ul>
    <h2 id="sources">Release sources</h2>
    {#if data.sourceUrl}<p><a href={data.sourceUrl}>Source changes on GitHub</a></p>{/if}
    <p><a href={data.registryUrl}>Registry publication and package metadata</a></p>
    <p><a href="/docs/installation">Install the current release</a></p>
  </article>
  <nav class="contents" aria-label="On this page"><p>On this page</p><a href="#changes">Changes</a><a href="#sources">Release sources</a></nav>
</div>
