<script lang="ts">
  import type { WordAuthoredShape } from '@tumblerjs/word';
  let { shape }: { shape: WordAuthoredShape } = $props();
  const paths = $derived({
    triangle: `M${shape.width / 2} 1 L${shape.width - 1} ${shape.height - 1} L1 ${shape.height - 1} Z`,
    diamond: `M${shape.width / 2} 1 L${shape.width - 1} ${shape.height / 2} L${shape.width / 2} ${shape.height - 1} L1 ${shape.height / 2} Z`,
    rightArrow: `M1 ${shape.height * .3} H${shape.width * .6} V1 L${shape.width - 1} ${shape.height / 2} L${shape.width * .6} ${shape.height - 1} V${shape.height * .7} H1 Z`,
    line: `M1 ${shape.height - 1} L${shape.width - 1} 1`,
  });
</script>
<div class="shape" role="img" aria-label={shape.alt ?? shape.text ?? shape.preset}>
  <svg viewBox={`0 0 ${shape.width} ${shape.height}`} preserveAspectRatio="none" aria-hidden="true">
    <g fill={shape.fill} stroke={shape.outline} stroke-width={shape.outlineWidth}>
      {#if shape.preset === 'ellipse'}<ellipse cx={shape.width / 2} cy={shape.height / 2} rx={Math.max(0, shape.width / 2 - 1)} ry={Math.max(0, shape.height / 2 - 1)} />
      {:else if shape.preset === 'rect' || shape.preset === 'roundRect'}<rect x="1" y="1" width={Math.max(0, shape.width - 2)} height={Math.max(0, shape.height - 2)} rx={shape.preset === 'roundRect' ? Math.min(shape.width, shape.height) * .12 : 0} />
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
