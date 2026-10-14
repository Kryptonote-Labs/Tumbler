<script lang="ts">
  import Code from '$lib/components/Code.svelte';
  import { repository, version } from '$lib/site';
  let { data } = $props();
</script>
<svelte:head><title>Tumbler docs</title><meta name="description" content="Read, render, and edit Office documents with TypeScript and Svelte. Tumbler documentation and a live document playground." /></svelte:head>
<div class="doc-layout">
  <article>
    <h1>Office documents, in your app.</h1>
    <p class="lead">Tumbler gives you TypeScript models and Svelte components for reading, rendering, and editing Word documents, spreadsheets, and PowerPoint presentations.</p>
    <div class="note"><p>Early alpha. APIs are still changing and Office compatibility is incomplete. Keep original copies of important documents.</p></div>
    <p><a href="/docs/releases">Release {version}</a> adds Word styles, lists, links, paragraph formatting, explicit breaks, and editable shapes. Explore the <a href="/docs/word">Word guides</a> for examples.</p>
    <h2 id="start">Start with a document</h2>
    <p>Install the components alongside the document formats you need.</p>
    <Code {...data.install} />
    <p>The <a href="/docs/installation">installation guide</a> walks through a complete file viewer. To inspect rendering first, open a sample in the <a href="/playground/word-brief">playground</a>.</p>
    <h2 id="formats">Choose a format</h2>
    <div class="format-list">
      <a href="/docs/word"><strong>Word</strong><span>Paginated documents, rich authoring, tables, drawings, and optional collaboration.</span><span class="arrow" aria-hidden="true">→</span></a>
      <a href="/docs/spreadsheets"><strong>Spreadsheets</strong><span>Virtualized worksheets, formulas, cell edits, and formatting.</span><span class="arrow" aria-hidden="true">→</span></a>
      <a href="/docs/powerpoint"><strong>PowerPoint</strong><span>Slide navigation, text and table editing, formatting, and object transforms.</span><span class="arrow" aria-hidden="true">→</span></a>
    </div>
    <h2 id="model">Keep control of your application</h2>
    <p>The format packages work without Svelte. The components render those models and emit edit events, leaving file storage, permissions, and the surrounding UI to you.</p>
    <Code {...data.example} />
    <p>Read <a href="/docs/architecture">how the packages fit together</a>, or check the <a href="/docs/compatibility">current limitations</a> before integrating.</p>
    <a class="doc-next" href="/docs/installation"><span>Next <strong>Installation</strong></span><span aria-hidden="true">→</span></a>
    <footer class="page-footer"><span>MIT licensed</span><a href={repository}>View source ↗</a></footer>
  </article>
  <nav class="contents" aria-label="On this page"><p>On this page</p><a href="#start">Start with a document</a><a href="#formats">Choose a format</a><a href="#model">Application ownership</a></nav>
</div>
