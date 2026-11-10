<script lang="ts">
  import { pdfMarkupDisplayQuads, type PdfPage, type PdfMarkup } from '@tumblerjs/pdf';
  let { page, annotations }: { page: PdfPage; annotations: PdfMarkup[] } = $props();
  function line(q: number[], kind: PdfMarkup['kind']) {
    const t = kind === 'StrikeOut' ? 0.5 : 0.9;
    return {
      x1: q[0]! * (1 - t) + q[4]! * t,
      y1: q[1]! * (1 - t) + q[5]! * t,
      x2: q[2]! * (1 - t) + q[6]! * t,
      y2: q[3]! * (1 - t) + q[7]! * t,
    };
  }
</script>

<svg
  viewBox={`0 0 ${page.width} ${page.height}`}
  aria-hidden="true"
  style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"
>
  {#each annotations.filter((a) => !a.hidden) as annotation (annotation.id)}
    {#each pdfMarkupDisplayQuads(page, annotation) as q}
      {#if annotation.kind === 'Highlight'}
        <polygon
          points={`${q[0]},${q[1]} ${q[2]},${q[3]} ${q[6]},${q[7]} ${q[4]},${q[5]}`}
          fill={annotation.color}
          opacity="0.35"
          style="mix-blend-mode:multiply"
        />
      {:else}
        <line {...line(q, annotation.kind)} stroke={annotation.color} stroke-width="1" />
      {/if}
    {/each}
  {/each}
</svg>
