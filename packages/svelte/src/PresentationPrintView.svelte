<script lang="ts">
  import type { PresentationDocument } from '@tumblerjs/slides';
  import PresentationSlideView from './PresentationSlideView.svelte';
  let { presentation }: { presentation: PresentationDocument } = $props();
</script>
<svelte:element this={"style"}>{`@page tumbler-slide { size: ${presentation.width}px ${presentation.height}px; margin: 0; }`}</svelte:element>
{#each presentation.slides as slide}
  <section style={`page:tumbler-slide;width:${presentation.width}px;height:${presentation.height}px;break-after:page;overflow:hidden;print-color-adjust:exact`}>
    <PresentationSlideView {presentation} {slide} thumbnail />
  </section>
{/each}
