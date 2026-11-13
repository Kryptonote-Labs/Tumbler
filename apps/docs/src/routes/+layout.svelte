<script lang="ts">
  import { page } from '$app/state';
  import { afterNavigate, goto } from '$app/navigation';
  import { navigation, version, repository } from '$lib/site';
  import { legacyDocLinks } from '$lib/docs/legacy-links';
  import SidebarGroup from '$lib/components/SidebarGroup.svelte';
  import '../app.css';
  let { children } = $props();
  let menuOpen = $state(false);
  afterNavigate(() => {
    menuOpen = false;
    const destination = legacyDocLinks[page.url.pathname + page.url.hash];
    if (destination) void goto(destination, { replaceState: true });
  });
  const active = (href: string) => href.startsWith('/playground') ? page.url.pathname.startsWith('/playground') : page.url.pathname === href || href === '/changelog' && page.url.pathname.startsWith('/changelog/');
</script>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <a href="/" class="brand" aria-label="Tumbler documentation home"><img src="/favicon.svg" alt="" width="22" height="22" />Tumbler<span class="brand-version">{version}</span></a>
  <div class="header-links"><a href="/docs/installation" class:active={!page.url.pathname.startsWith('/components') && !page.url.pathname.startsWith('/playground')}>Docs</a><a href="/components" class:active={page.url.pathname.startsWith('/components')}>Components</a><a href="/playground/word-brief" class:active={page.url.pathname.startsWith('/playground')}>Playground</a><a href={repository} target="_blank" rel="noreferrer">GitHub</a><button class="menu-button" aria-expanded={menuOpen} aria-controls="site-nav" onclick={() => menuOpen = !menuOpen}>{menuOpen ? 'Close' : 'Menu'}</button></div>
</header>
{#snippet groupLinks(links: { href: string; label: string }[])}
  {#each links as link}
    <a href={link.href} aria-current={active(link.href) ? 'page' : undefined}>
      {link.label}
    </a>
  {/each}
{/snippet}
<div class="site-shell">
  <aside class="sidebar" class:open={menuOpen}>
    <nav id="site-nav" aria-label="Documentation">
      {#each navigation as group}
        {#if group.overview}
          <SidebarGroup title={group.title} overview={group.overview} links={group.links} pathname={page.url.pathname} />
        {:else}
          <div class="nav-group"><p>{group.title}</p>{@render groupLinks(group.links)}</div>
        {/if}
      {/each}
    </nav>
  </aside>
  <main id="main" class:playground-main={page.url.pathname.startsWith('/playground')} tabindex="-1">{@render children()}</main>
</div>
