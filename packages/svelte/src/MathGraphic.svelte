<script lang="ts">
  import {
    isMathCollapsed,
    mathCaretRect,
    mathPositionAt,
    mathSelectionRects,
    type MathLayout,
    type MathPosition,
    type MathSelection,
  } from '@tumblerjs/core/math';

  // Draws a Tumbler equation layout in its own units, scaled to `width` × `height` CSS pixels.
  // With `selection`, it also draws the caret or selection; `focused` makes the caret blink.
  // `onposition` reports pointer presses and drags as equation positions.
  let {
    layout,
    width,
    height,
    fontFamily,
    color = 'currentColor',
    selection,
    focused = false,
    active = false,
    onposition,
  }: {
    layout: MathLayout;
    width: number;
    height: number;
    fontFamily: string;
    color?: string;
    selection?: MathSelection;
    focused?: boolean;
    /** Highlights the equation's extent, like a field being edited. */
    active?: boolean;
    onposition?: (position: MathPosition, extend: boolean, event: PointerEvent) => void;
  } = $props();
  const top = $derived(-layout.ascent);
  const span = $derived(Math.max(layout.ascent + layout.descent, 0.01));
  const caret = $derived(
    selection && isMathCollapsed(selection) ? mathCaretRect(layout, selection.focus) : undefined,
  );
  const highlighted = $derived(selection ? mathSelectionRects(layout, selection) : []);
  let svg = $state<SVGSVGElement>();

  // Native listeners, not delegated ones: hosts such as editable text stop propagation before
  // a press would reach the document root.
  function press(node: SVGSVGElement) {
    let dragging = false;
    const down = (event: PointerEvent) => {
      if (!onposition || event.button !== 0) return;
      dragging = true;
      node.setPointerCapture(event.pointerId);
      onposition(position(event), event.shiftKey, event);
    };
    const move = (event: PointerEvent) => {
      if (dragging) onposition?.(position(event), true, event);
    };
    const up = () => (dragging = false);
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
    };
  }

  function position(event: PointerEvent) {
    const box = svg!.getBoundingClientRect();
    const x = ((event.clientX - box.left) / Math.max(1, box.width)) * Math.max(layout.width, 0.01);
    const y = top + ((event.clientY - box.top) / Math.max(1, box.height)) * span;
    return mathPositionAt(layout, x, y);
  }
</script>

<svg
  bind:this={svg}
  data-equation-graphic
  class="math-graphic"
  class:active
  {width}
  {height}
  viewBox={`0 ${top} ${Math.max(layout.width, 0.01)} ${span}`}
  aria-hidden="true"
  style:color
  style:font-family={fontFamily}
  {@attach press}
>
  {#each highlighted as rect}
    <rect class="selection" x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
  {/each}
  {#each layout.items as item}
    {#if item.kind === 'glyph'}
      <text
        x={item.scaleY ? 0 : item.x}
        y={item.scaleY ? 0 : item.y}
        transform={item.scaleY
          ? `translate(${item.x} ${item.y}) scale(1 ${item.scaleY})`
          : undefined}
        font-size={item.size}
        font-style={item.italic ? 'italic' : undefined}
        font-weight={item.bold ? 700 : undefined}>{item.text}</text
      >
    {:else if item.kind === 'rule'}
      <rect x={item.x} y={item.y} width={item.width} height={item.height} fill="currentColor" />
    {:else if item.kind === 'path'}
      <polyline
        points={item.points.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke="currentColor"
        stroke-width={item.width}
        stroke-linejoin="round"
      />
    {:else if item.kind === 'slot'}
      <rect
        class="slot"
        x={item.x + item.width * 0.08}
        y={item.y}
        width={item.width * 0.84}
        height={item.height}
        stroke-width={item.height * 0.06}
        stroke-dasharray={`${item.height * 0.1} ${item.height * 0.1}`}
      />
    {:else}
      <text class="prompt" x={item.x} y={item.y} font-size={item.size}>{item.text}</text>
    {/if}
  {/each}
  {#if caret && focused}
    <rect
      class="caret"
      x={caret.x - span * 0.012}
      y={caret.top}
      width={Math.max(span * 0.025, 0.5)}
      height={caret.bottom - caret.top}
    />
  {/if}
</svg>

<style>
  .math-graphic {
    display: block;
    overflow: visible;
    fill: currentColor;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: text;
  }
  .math-graphic.active {
    border-radius: 2px;
    background: color-mix(in srgb, currentColor 7%, transparent);
  }
  .slot {
    fill: none;
    stroke: currentColor;
    opacity: 0.45;
  }
  .prompt {
    opacity: 0.5;
  }
  .selection {
    fill: Highlight;
    opacity: 0.35;
  }
  .caret {
    fill: currentColor;
    animation: math-caret 1.06s steps(1) infinite;
  }
  @keyframes math-caret {
    50% {
      opacity: 0;
    }
  }
  @media print {
    .slot,
    .prompt,
    .caret,
    .selection {
      display: none;
    }
    .math-graphic.active {
      background: none;
    }
  }
</style>
