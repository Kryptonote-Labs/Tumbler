<script lang="ts">
  import { PdfMerger } from '@tumblerjs/svelte/pdf';
</script>
<svelte:head><title>Merge PDFs · Tumbler</title><meta name="description" content="Merge and reorder PDF pages locally in your browser with Tumbler." /></svelte:head>
<main>
  <h1>Merge PDFs</h1>
  <PdfMerger />
  <h2>Use the same selections in the CLI</h2>
  <pre>tumbler first.pdf pdf merge --pages 3,1-2 --source second.pdf --pages 4-2 --output merged.pdf</pre>
  <p>Each row matches one CLI source. Repeat <code>--source first.pdf</code> to add another selection from that file.</p>
  <p>Pages keep their text, embedded fonts, images, vectors, annotations and geometry. Form fields receive source prefixes to avoid name collisions. The result is a new unencrypted PDF. Digital signatures cannot survive merging. XFA forms, conflicting accessibility maps or IDs, PDF 2.0 accessibility namespaces, and automatic or non-default layer configurations report an error.</p>
</main>
<style>main { max-width: 70rem; margin: 0 auto; padding: 3rem 2rem; } h1 { font-size: 2.5rem; margin-bottom: 1.5rem; } h2 { margin-top: 2rem; } pre { overflow: auto; padding: 1rem; background: #8882; } p { line-height: 1.6; }</style>
