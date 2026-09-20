<script lang="ts">
  import { page } from '$app/state';
  import { afterNavigate } from '$app/navigation';
  import { navigation, version, commit, repository } from '$lib/site';
  import '../app.css';
  let { children } = $props();
  let menuOpen = $state(false);
  afterNavigate(() => menuOpen = false);
  const active = (href: string) => href.startsWith('/playground') ? page.url.pathname.startsWith('/playground') : page.url.pathname === href;
</script>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <a href="/" class="brand" aria-label="Tumbler home"><img src="/favicon.svg" alt="" width="28" height="28" />Tumbler<span class="brand-divider"></span><span class="brand-docs">Docs</span></a>
  <div class="header-links"><a href="/playground/word-brief">Playground</a><a href={repository} target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a><button class="menu-button" aria-expanded={menuOpen} aria-controls="site-nav" onclick={() => menuOpen = !menuOpen}>{menuOpen ? 'Close' : 'Menu'}</button></div>
</header>
<div class="site-shell">
  <aside class="sidebar" class:open={menuOpen}>
    <nav id="site-nav" aria-label="Documentation">
      {#each navigation as group}
        <div class="nav-group"><p>{group.title}</p>{#each group.links as link}<a href={link.href} class:active={active(link.href)} aria-current={active(link.href) ? 'page' : undefined}>{link.label}{#if link.label === 'Playground'}<span aria-hidden="true">↗</span>{/if}</a>{/each}</div>
      {/each}
    </nav>
    <div class="sidebar-footer"><span class="version-dot"></span><span>{version}</span><a href={`${repository}/commit/${commit}`} title="Source commit">{commit}</a></div>
  </aside>
  <main id="main" class:playground-main={page.url.pathname.startsWith('/playground')} tabindex="-1">{@render children()}</main>
</div>
