<script lang="ts">
  import type { SpreadsheetDrawingObject } from '@tumblerjs/sheets';
  import type { MathPosition } from '@tumblerjs/core/math';
  import SpreadsheetDrawingImage from './SpreadsheetDrawingImage.svelte';
  import SpreadsheetEquation, { type SpreadsheetEquationEditing } from './SpreadsheetEquation.svelte';
  let {
    object,
    equation,
    onequation,
    onequationcaret,
  }: {
    object: SpreadsheetDrawingObject;
    /** Set while the host edits this object's equation. */
    equation?: SpreadsheetEquationEditing | undefined;
    /** A press on the equation, as an equation position; given while the equation can be edited. */
    onequation?: ((position: MathPosition, extend: boolean) => void) | undefined;
    onequationcaret?: ((rect: { left: number; top: number; height: number }) => void) | undefined;
  } = $props();
</script>

{#snippet node(item: SpreadsheetDrawingObject, root = false)}
  <g transform={`translate(${root ? 0 : item.x} ${root ? 0 : item.y}) rotate(${item.rotation} ${item.width / 2} ${item.height / 2}) translate(${item.flipX ? item.width : 0} ${item.flipY ? item.height : 0}) scale(${item.flipX ? -1 : 1} ${item.flipY ? -1 : 1})`}>
    {#if item.kind === 'group'}
      <g transform={`scale(${item.groupChild.scaleX} ${item.groupChild.scaleY}) translate(${-item.groupChild.x} ${-item.groupChild.y})`}>
        {#each item.children as child (child.elementId)}{@render node(child)}{/each}
      </g>
    {:else if item.kind === 'picture'}
      <SpreadsheetDrawingImage object={item} />
    {:else}
      {#each item.geometry?.paths ?? [] as path}
        <path d={path.d} fill={path.fill === 'none' ? 'none' : item.fill} stroke={path.stroke ? item.stroke : 'none'} stroke-width={item.strokeWidth} stroke-linejoin="round" />
      {/each}
      {#if item.equation}<SpreadsheetEquation
          equation={item.equation}
          width={item.width}
          editing={root ? equation : undefined}
          onposition={root ? onequation : undefined}
          oncaret={root ? onequationcaret : undefined}
        />{/if}
      {#if item.text}<foreignObject width={item.width} height={item.height}><div xmlns="http://www.w3.org/1999/xhtml" style="text-align:left;white-space:pre-wrap;font:16px sans-serif;color:#111;overflow:hidden;width:100%;height:100%">{item.text}</div></foreignObject>{/if}
    {/if}
  </g>
{/snippet}

<svg preserveAspectRatio="none" width="100%" height="100%" viewBox={`0 0 ${Math.max(1, object.width)} ${Math.max(1, object.height)}`} overflow="visible" role="img" aria-label={object.name}>
  {@render node(object, true)}
</svg>
