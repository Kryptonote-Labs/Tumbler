<script lang="ts">
  import type { WordAuthoredShape } from '@tumblerjs/word';
  let { shape }: { shape: WordAuthoredShape } = $props();
  const paths = { triangle: 'M50 2 L98 98 L2 98 Z', diamond: 'M50 2 L98 50 L50 98 L2 50 Z', rightArrow: 'M2 30 H60 V2 L98 50 L60 98 V70 H2 Z', line: 'M1 99 L99 1' };
</script>
<div class="shape" aria-label={shape.alt ?? shape.preset}>
  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <g fill={shape.fill} stroke={shape.outline} stroke-width={shape.outlineWidth * 100 / shape.width}>
      {#if shape.preset === 'ellipse'}<ellipse cx="50" cy="50" rx="48" ry="48" />
      {:else if shape.preset === 'rect' || shape.preset === 'roundRect'}<rect x="1" y="1" width="98" height="98" rx={shape.preset === 'roundRect' ? 12 : 0} />
      {:else}<path d={paths[shape.preset]} />{/if}
    </g>
  </svg>
  {#if shape.text}<span>{shape.text}</span>{/if}
</div>
<style>
  .shape { position: relative; width: 100%; height: 100%; }
  svg { display: block; width: 100%; height: 100%; }
  span { position: absolute; inset: 6px; display: grid; place-content: center; text-align: center; white-space: pre-wrap; overflow: hidden; color: #000; font: 16px Aptos, sans-serif; }
</style>
