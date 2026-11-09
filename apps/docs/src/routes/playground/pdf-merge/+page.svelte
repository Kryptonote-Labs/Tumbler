<script lang="ts">
  import { PdfMerge } from '@tumblerjs/svelte/pdf';
</script>
<svelte:head>
  <title>Merge PDFs · Tumbler playground</title>
  <meta name="description" content="Combine PDF pages locally, with page selection, ordering, and repeated pages using the same Tumbler API as the CLI." />
</svelte:head>
<h1>Merge PDFs</h1>
<p class="description">Build a new PDF from whole documents or selected pages. Choose the same page ranges and order available in the CLI.</p>
<PdfMerge />
<p class="more"><a href="/docs/pdf-merge">API, CLI, and preservation details ↗</a> · <a href="/playground/word-brief">Document playground</a></p>
<style>
  .description, .more { color: var(--soft); line-height: 1.7; margin: 20px 0 28px; }
  .more { font-size: 12px; margin-top: 36px; }
  a { text-decoration: underline; text-underline-offset: 3px; }
</style>
