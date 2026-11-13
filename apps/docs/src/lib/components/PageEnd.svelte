<script lang="ts">
  import { repository, type NavigationLink } from '$lib/site';

  /**
   * The close of every article: previous/next cards, then a footer link to the page's
   * source on GitHub (or the repository when the page has no single source file).
   */
  let { previous, next, source }: {
    previous?: NavigationLink;
    next?: NavigationLink;
    /** Repo-relative path of the file that holds this page's content. */
    source?: string;
  } = $props();
</script>

{#if previous || next}
  <nav class="pager" aria-label="Pages">
    {#if previous}<a href={previous.href}><span>Previous</span><strong>{previous.label}</strong></a>{/if}
    {#if next}<a class="pager-next" href={next.href}><span>Next</span><strong>{next.label}</strong></a>{/if}
  </nav>
{/if}
<footer class="page-footer">
  {#if source}<a href={`${repository}/blob/main/${source}`}>Edit this page on GitHub</a>
  {:else}<a href={repository}>View source on GitHub</a>{/if}
</footer>
