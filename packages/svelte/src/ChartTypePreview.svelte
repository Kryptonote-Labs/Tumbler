<script lang="ts">
  import { chartTypePreview } from './chart-type-preview.ts';
  import type { ChartTypeChange } from './chart-properties.ts';
  let { change }: { change: ChartTypeChange } = $props();
</script>

<img
  src={chartTypePreview(change)}
  width="120"
  height="72"
  alt=""
  loading="lazy"
  decoding="async"
/>

<style>
  img {
    display: block;
    max-width: 100%;
    object-fit: contain;
    border-radius: 3px;
  }
</style>
