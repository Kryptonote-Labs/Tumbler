<!--
  Renders authored text without {@html}: `backticked` spans become inline code and
  [label](href) becomes a link. Code spans win, so a link inside backticks stays literal.
-->
<script lang="ts">
  type Part =
    | { kind: 'text' | 'code'; value: string }
    | { kind: 'link'; value: string; href: string };

  let { text }: { text: string } = $props();

  const token = /`([^`]*)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

  function parse(source: string): Part[] {
    const parts: Part[] = [];
    let last = 0;
    for (const match of source.matchAll(token)) {
      if (match.index > last) parts.push({ kind: 'text', value: source.slice(last, match.index) });
      const [, code, label, href] = match;
      parts.push(code !== undefined ? { kind: 'code', value: code } : { kind: 'link', value: label!, href: href! });
      last = match.index + match[0].length;
    }
    if (last < source.length) parts.push({ kind: 'text', value: source.slice(last) });
    return parts;
  }

  const parts = $derived(parse(text));
</script>

{#each parts as part}{#if part.kind === 'code'}<code>{part.value}</code>{:else if part.kind === 'link'}<a href={part.href}>{part.value}</a>{:else}{part.value}{/if}{/each}
