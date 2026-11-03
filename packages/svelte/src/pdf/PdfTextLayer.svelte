<script lang="ts">
  import type { PdfTextContent } from '@tumblerjs/pdf';
  import { selectPdfWord } from './selection.ts';
  let { content, scale = 1, label = 'PDF text' }: {
    content: PdfTextContent;
    scale?: number;
    label?: string;
  } = $props();
  // Large local font size avoids tiny-font measurement rounding. The source em matrix positions the result.
  const items = $derived.by(() => {
    const canvas = typeof document === 'undefined' ? undefined : document.createElement('canvas'), measure = canvas?.getContext('2d');
    const widths = new Map<string, number>();
    return content.items.map(item => {
      const font = `${item.font.style} ${item.font.weight} 100px ${item.font.family}`;
      const text = item.text === '\n' ? ' ' : item.text, key = font + '\0' + text;
      let natural = widths.get(key);
      if (natural === undefined) {
        if (measure) measure.font = font;
        natural = measure?.measureText(text).width ?? 100;
        widths.set(key, natural);
      }
      const fit = natural > 0 ? Math.max(0,item.width) / natural : 0;
      const [a,b,c,d,e,f] = item.transform;
      return {item,transform:`matrix(${a*fit},${b*fit},${c/100},${d/100},${e-c*item.ascent},${f-d*item.ascent})`};
    });
  });
</script>

<div class="text-layer" data-pdf-text-layer ondblclick={event => selectPdfWord(event, content, event.currentTarget)} role="document" aria-label={label}
  style:width={`${content.width}px`} style:height={`${content.height}px`} style:transform={`scale(${scale})`}>
  {#each items as {item,transform} (item.id)}
    <span data-pdf-text={item.kind} data-pdf-glyph={item.kind === 'glyph' ? item.id : undefined}
      dir="auto" style:transform style:height={`${item.height*100}px`} style:line-height={`${item.height*100}px`}
      style:font-family={item.font.family} style:font-weight={item.font.weight} style:font-style={item.font.style}
    >{item.text}</span>
  {/each}
</div>

<style>
  .text-layer { position: absolute; left: 0; top: 0; transform-origin: 0 0; overflow: clip; user-select: text; -webkit-user-select: text; color: transparent; }
  span { position: absolute; left: 0; top: 0; display: inline-block; font-size: 100px; white-space: pre; transform-origin: 0 0; cursor: text; color: transparent; -webkit-text-fill-color: transparent; unicode-bidi: isolate; }
  span[data-pdf-text='separator'] { pointer-events: none; }
  span::selection { background: rgb(64 128 255 / .35); color: transparent; }
</style>
