<script lang="ts">import { page } from '$app/state';</script>
<svelte:head><title>{page.status} · Tumbler</title></svelte:head>
<p class="eyebrow">{page.status}</p><h1>{page.status === 404 ? 'Page not found' : 'Could not load this page'}</h1><p class="lead">Return to the documentation and try again.</p><a class="button" href="/">Documentation</a>
