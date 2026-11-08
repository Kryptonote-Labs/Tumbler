<script lang="ts">
  import type { SpreadsheetDrawingObject } from '@tumblerjs/sheets';
  import SpreadsheetDrawingImage from './SpreadsheetDrawingImage.svelte';
  let { object }: { object: SpreadsheetDrawingObject } = $props();
</script>

{#snippet node(item: SpreadsheetDrawingObject, root = false)}
  <g transform={`translate(${root ? 0 : item.x} ${root ? 0 : item.y}) rotate(${item.rotation} ${item.width / 2} ${item.height / 2}) translate(${item.flipX ? item.width : 0} ${item.flipY ? item.height : 0}) scale(${item.flipX ? -1 : 1} ${item.flipY ? -1 : 1})`}>
    {#if item.kind === 'group'}
      <g transform={item.groupTransform}>
        {#each item.children as child (child.elementId)}{@render node(child)}{/each}
      </g>
    {:else if item.kind === 'picture'}
      <SpreadsheetDrawingImage object={item} />
    {:else}
      {#each item.geometry?.paths ?? [] as path}
        <path d={path.d} fill={path.fill === 'none' ? 'none' : item.fill} stroke={path.stroke ? item.stroke : 'none'} stroke-width={item.strokeWidth} stroke-linejoin="round" />
      {/each}
      {#if item.text}<foreignObject width={item.width} height={item.height}><div xmlns="http://www.w3.org/1999/xhtml" style="text-align:left;white-space:pre-wrap;font:16px sans-serif;color:#111;overflow:hidden;width:100%;height:100%">{item.text}</div></foreignObject>{/if}
    {/if}
  </g>
{/snippet}

<svg preserveAspectRatio="none" width="100%" height="100%" viewBox={`0 0 ${Math.max(1, object.width)} ${Math.max(1, object.height)}`} overflow="visible" role="img" aria-label={object.name}>
  {@render node(object, true)}
</svg>
