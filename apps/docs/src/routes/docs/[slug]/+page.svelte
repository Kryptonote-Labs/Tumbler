<script lang="ts">
  import Code from '$lib/components/Code.svelte';
  import { repository } from '$lib/site';
  let { data } = $props();
</script>
<svelte:head><title>{data.doc.title} · Tumbler</title><meta name="description" content={data.doc.description} /></svelte:head>
<div class="doc-layout">
  <article>
    <h1>{data.doc.title}</h1><p class="lead">{data.doc.description}</p>
    {#each data.doc.sections as section}
      <section aria-labelledby={section.id}>
        <h2 id={section.id}>{section.title}</h2>
        {#each section.blocks as block}
          {#if block.kind === 'text'}<p>{block.text}</p>
          {:else if block.kind === 'note'}<div class="note"><p>{block.text}</p></div>
          {:else if block.kind === 'code'}<Code code={block.code} html={block.html} language={block.language} />
          {:else if block.kind === 'link'}<p><a href={block.href}>{block.label}</a></p>
          {:else if block.kind === 'list'}<ul>{#each block.items as item}<li>{item}</li>{/each}</ul>
          {:else if block.kind === 'table'}<div class="table-wrap"><table><thead><tr>{#each block.headers as header}<th>{header}</th>{/each}</tr></thead><tbody>{#each block.rows as row}<tr>{#each row as cell}<td>{cell}</td>{/each}</tr>{/each}</tbody></table></div>{/if}
        {/each}
      </section>
    {/each}
    {#if data.doc.next}<a class="doc-next" href={data.doc.next.href}><span>Next <strong>{data.doc.next.label}</strong></span><span aria-hidden="true">→</span></a>{/if}
    <footer class="page-footer"><span>MIT licensed</span><a href={`${repository}/blob/main/apps/docs/src/lib/docs.ts`}>Edit this page ↗</a></footer>
  </article>
  <nav class="contents" aria-label="On this page"><p>On this page</p>{#each data.doc.sections as section}<a href={`#${section.id}`}>{section.title}</a>{/each}</nav>
</div>
