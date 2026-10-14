<script lang="ts">
  import { untrack } from 'svelte';
  import type { NavigationLink } from '$lib/site';

  let { title, overview, links, pathname }: {
    title: string;
    overview: string;
    links: NavigationLink[];
    pathname: string;
  } = $props();
  const current = $derived(pathname === overview || links.some(link => link.href === pathname));
  const id = $derived(`topics-${title.toLowerCase()}`);
  let expanded = $state(untrack(() => current));

  $effect(() => { expanded = pathname === overview || links.some(link => link.href === pathname); });
</script>

<div class="nav-group format-group">
  <div class="format-heading" class:current>
    <a href={overview} aria-current={pathname === overview ? 'page' : undefined}>{title}</a>
    <button class="format-toggle" aria-label={`Toggle ${title} topics`} aria-expanded={expanded} aria-controls={id} onclick={() => expanded = !expanded}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
    </button>
  </div>
  <div class="format-links" {id} hidden={!expanded}>
    {#each links as link}
      <a href={link.href} class:active={pathname === link.href} aria-current={pathname === link.href ? 'page' : undefined}>{link.label}</a>
    {/each}
  </div>
</div>
