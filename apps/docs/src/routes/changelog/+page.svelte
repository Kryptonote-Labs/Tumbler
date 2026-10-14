<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>Changelog · Tumbler</title><meta name="description" content="Tumbler release history, from the first spreadsheet packages to Word and PowerPoint editing." /></svelte:head>
<div class="doc-layout">
  <article>
    <h1>Changelog</h1>
    <p class="lead">What changed in each published release.</p>
    <p>Dates use the first package publication in UTC. Partial publications are marked. Earlier entries are backfilled from registry metadata and source history.</p>
    {#each data.groups as group}
      <section aria-labelledby={group.id}>
        <h2 id={group.id}>{group.label}</h2>
        <ul class="release-list">
          {#each group.releases as release}
            <li>
              <a class="release-link" href={`/changelog/${release.version}`}>
                <div class="release-meta"><span>{release.version}{#if release.partial}{' '}<span class="partial">Partial</span>{/if}</span><time datetime={release.date}>{release.dateLabel}</time></div>
                <p>{release.summary}</p>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </article>
  <nav class="contents" aria-label="On this page"><p>On this page</p>{#each data.groups as group}<a href={`#${group.id}`}>{group.label}</a>{/each}</nav>
</div>

<style>
  .release-list { list-style: none; padding: 0; margin: 0; }
  .release-list li { margin: 0; padding: 0; border-bottom: 1px solid var(--border); }
  .release-list a.release-link { display: block; padding: 17px 0; text-decoration: none; }
  .release-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; color: var(--text); font-size: 14px; }
  .release-meta time { color: var(--faint); font-size: 11px; white-space: nowrap; }
  .release-link p { font-size: 13px; margin: 5px 0 0; }
  .release-link:hover .release-meta { color: var(--accent); }
  .partial { margin-left: 9px; color: var(--faint); font-size: 10px; }
  @media (max-width: 450px) { .release-meta { align-items: flex-start; flex-direction: column; gap: 3px; } }
</style>
