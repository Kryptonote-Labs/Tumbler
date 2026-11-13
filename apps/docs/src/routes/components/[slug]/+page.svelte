<script lang="ts">
  import Code from '$lib/components/Code.svelte';
  import PageEnd from '$lib/components/PageEnd.svelte';
  import Prose from '$lib/components/Prose.svelte';
  import LiveExample from '$lib/components/example/LiveExample.svelte';
  let { data } = $props();
  const doc = $derived(data.doc);
</script>

<svelte:head><title>{doc.name} · Components · Tumbler</title><meta name="description" content={doc.summary} /></svelte:head>
<div class="doc-layout no-contents">
  <article class="doc">
    <header class="doc-header">
      <h1>{doc.name}</h1>
      <p class="lead">{doc.summary}</p>
      <p class="import-line"><code>import {'{'} {doc.name} {'}'} from '{doc.module}';</code></p>
    </header>
    <section aria-labelledby="example">
      <h2 id="example"><a href="#example">Example</a></h2>
      {#key doc.slug}<LiveExample id={doc.slug} html={data.exampleHtml} />{/key}
    </section>
    <section aria-labelledby="usage">
      <h2 id="usage"><a href="#usage">Usage</a></h2>
      <p><Prose text={doc.usage} /></p>
      {#if data.loader}
        <p>The example takes the file contents as a <code>bytes</code> prop. To run it in your app, save the example source as <code>{data.loader.file}</code>, put <code>{data.loader.sample}</code> in <code>static/</code>, and load it from <code>+page.svelte</code>:</p>
        <Code code={data.loader.code} html={data.loader.html} title={data.loader.title} language="Svelte" />
      {/if}
      <p><a href={doc.guide.href}>Guide: {doc.guide.label} →</a></p>
    </section>
    <section aria-labelledby="props">
      <h2 id="props"><a href="#props">Props</a></h2>
      <div class="table-wrap">
        <table class="props">
          <thead><tr><th>Prop</th><th>Description</th></tr></thead>
          <tbody>
            {#each doc.props as prop}
              <tr>
                <td>
                  <code>{prop.name}</code>{#if prop.required}<span class="required">required</span>{/if}
                  <code class="type">{prop.type}</code>
                </td>
                <td><Prose text={prop.description} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
    <PageEnd
      previous={data.previous && { href: `/components/${data.previous.slug}`, label: data.previous.name }}
      next={data.next && { href: `/components/${data.next.slug}`, label: data.next.name }}
      source="apps/docs/src/lib/examples/components.ts"
    />
  </article>
</div>

<style>
  /* One unbroken line; scrolls on its own on narrow screens instead of splitting mid-path. */
  .import-line code { display: inline-block; max-width: 100%; overflow-x: auto; vertical-align: top; font-size: 13px; white-space: pre; }
  /* Name, required flag and type share the first column so long types wrap at spaces, not mid-word. */
  .props td:first-child { width: 42%; }
  .props td:first-child code:first-child { white-space: nowrap; }
  .required { margin-left: 8px; color: var(--faint); font-size: 12px; }
  .props .type { display: block; width: fit-content; margin-top: 6px; color: var(--soft); white-space: normal; overflow-wrap: normal; }
  /* Narrow screens: prop and type first, description below. */
  @media (max-width: 760px) {
    .props thead { display: none; }
    .props tr { display: grid; gap: 6px; padding: 12px 0; border-bottom: 1px solid var(--border); }
    .props td { width: auto !important; border: 0; padding: 0; }
  }
</style>
