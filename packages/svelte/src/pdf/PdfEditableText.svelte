<script lang="ts">
  import * as Y from 'yjs';
  import {
    pdfFontKey,
    type PdfTextModel,
    type PdfTextLayout,
    type PdfFlowRegion,
  } from '@tumblerjs/pdf';
  type Peer = {
    id: string;
    name: string;
    color: string;
    selection?: { region: string; anchor: number[]; head: number[] } | null;
  };
  let {
    model,
    layouts,
    peers,
    active,
    start,
    end,
    onfocus,
  }: {
    model: PdfTextModel;
    layouts: PdfFlowRegion[];
    peers: Peer[];
    active?: string;
    start: number;
    end: number;
    onfocus: (id: string) => void;
  } = $props();
  function peerRange(peer: (typeof peers)[number], layout: PdfTextLayout) {
    try {
      if (!peer.selection || peer.selection.region !== layout.id) return;
      const resolve = (data: number[]) =>
        Y.createAbsolutePositionFromRelativePosition(
          Y.decodeRelativePosition(new Uint8Array(data)),
          model.doc,
        );
      const a = resolve(peer.selection.anchor),
        b = resolve(peer.selection.head);
      if (!a || !b) return;
      return {
        start: Math.min(a.index, b.index),
        end: Math.max(a.index, b.index),
        caret: layout.carets.find((c) => c.offset === b.index),
      };
    } catch {
      return;
    }
  }
</script>

{#each layouts.filter((l) => !model.placement(l.id)?.hidden) as layout (layout.id + ':' + layout.page)}
  <div class="text-region" data-pdf-text-region={layout.id}>
    <button
      class="region-focus"
      aria-label={model.text(layout.id).toString() || 'Empty text region'}
      onfocus={() => onfocus(layout.id)}
      style:left={`${model.geometry(layout.id).x}px`}
      style:top={`${layout.top}px`}
      style:width={`${model.geometry(layout.id).width}px`}
      style:height={`${layout.bottom - layout.top}px`}
    ></button>
    {#each layout.glyphs as glyph}
      {#if glyph.text !== '\n'}<svg
          class="glyph"
          aria-hidden="true"
          width={Math.max(1, glyph.width + glyph.style.size)}
          height={glyph.style.size * 2}
          style:left={`${glyph.x}px`}
          style:top={`${glyph.y - glyph.style.size}px`}
          style:overflow="visible"
          ><text
            x="0"
            y={glyph.style.size}
            font-family={`PDF-${pdfFontKey(glyph.style)}`}
            font-size={glyph.style.size}
            fill="transparent"
            text-decoration={glyph.style.underline ? 'underline' : 'none'}>{glyph.text}</text
          ></svg
        >{/if}
      {#if active === layout.id && glyph.end > start && glyph.start < end}<span
          class="selection"
          style:left={`${glyph.x}px`}
          style:top={`${glyph.y - glyph.style.size * 0.85}px`}
          style:width={`${Math.max(1, glyph.width)}px`}
          style:height={`${glyph.style.size * 1.15}px`}
        ></span>{/if}
    {/each}
    {#if active === layout.id && start === end}
      {@const caret = layout.carets.find((c) => c.offset === start)}
      {#if caret}<span
          class="caret local"
          style:left={`${caret.x}px`}
          style:top={`${caret.y - caret.height * 0.85}px`}
          style:height={`${caret.height * 1.15}px`}
        ></span>{/if}
    {/if}
    {#each peers as peer (peer.id)}
      {@const range = peerRange(peer, layout)}
      {#if range}
        {#each layout.glyphs.filter((g) => g.end > range.start && g.start < range.end) as glyph}<span
            class="selection"
            style:background={peer.color}
            style:left={`${glyph.x}px`}
            style:top={`${glyph.y - glyph.style.size * 0.85}px`}
            style:width={`${Math.max(1, glyph.width)}px`}
            style:height={`${glyph.style.size * 1.15}px`}
          ></span>{/each}
        {#if range.caret}<span
            class="caret remote"
            style:--peer-color={peer.color}
            style:left={`${range.caret.x}px`}
            style:top={`${range.caret.y - range.caret.height * 0.85}px`}
            style:height={`${range.caret.height * 1.15}px`}><span>{peer.name}</span></span
          >{/if}
      {/if}
    {/each}
  </div>
{/each}

<style>
  .text-region {
    position: absolute;
    left: 0;
    top: 0;
  }
  .glyph {
    position: absolute;
    white-space: pre;
    line-height: 1;
    user-select: none;
  }
  .selection {
    position: absolute;
    background: #3684df;
    opacity: 0.23;
    pointer-events: none;
  }
  .caret {
    position: absolute;
    border-left: 1.5px solid #111;
    pointer-events: none;
  }
  .remote {
    border-color: var(--peer-color);
  }
  .remote > span {
    position: absolute;
    bottom: 100%;
    left: -1.5px;
    background: var(--peer-color);
    color: white;
    font: 10px/1.4 sans-serif;
    padding: 2px 5px;
    border-radius: 3px 3px 3px 0;
    white-space: nowrap;
  }

  .region-focus {
    position: absolute;
    opacity: 0;
    pointer-events: none;
    border: 0;
    padding: 0;
  }
</style>
