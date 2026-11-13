<script lang="ts">
  import Code from '$lib/components/Code.svelte';
  import Prose from '$lib/components/Prose.svelte';
  import LiveExample from '$lib/components/example/LiveExample.svelte';
  import PageEnd from '$lib/components/PageEnd.svelte';
  let { data } = $props();
</script>
<svelte:head><title>{data.doc.title} · Tumbler</title><meta name="description" content={data.doc.description} /></svelte:head>
<div class="doc-layout">
  <article class="doc">
    <header class="doc-header"><h1>{data.doc.title}</h1><p class="lead">{data.doc.description}</p></header>
    {#each data.doc.sections as section}
      <section aria-labelledby={section.id}>
        <h2 id={section.id}><a href={`#${section.id}`}>{section.title}</a></h2>
        {#each section.blocks as block}
          {#if block.kind === 'text'}<p><Prose text={block.text} /></p>
          {:else if block.kind === 'note'}<div class="note"><p><Prose text={block.text} /></p></div>
          {:else if block.kind === 'code'}<Code code={block.code} html={block.html} language={block.language} />
          {:else if block.kind === 'example'}<LiveExample id={block.example} html={block.html} />
          {:else if block.kind === 'link'}<p><a href={block.href}>{block.label} →</a></p>
          {:else if block.kind === 'list'}<svelte:element this={block.ordered ? 'ol' : 'ul'}>{#each block.items as item}<li><Prose text={item} /></li>{/each}</svelte:element>
          {:else if block.kind === 'table'}<div class="table-wrap"><table><thead><tr>{#each block.headers as header}<th>{header}</th>{/each}</tr></thead><tbody>{#each block.rows as row}<tr>{#each row as cell}<td><Prose text={cell} /></td>{/each}</tr>{/each}</tbody></table></div>{/if}
        {/each}
      </section>
    {/each}
    <PageEnd next={data.doc.next} source={data.doc.source} />
  </article>
  <nav class="contents" aria-label="On this page"><p>On this page</p>{#each data.doc.sections as section}<a href={`#${section.id}`}>{section.title}</a>{/each}</nav>
</div>
