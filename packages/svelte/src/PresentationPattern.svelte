<script lang="ts">
  import type { SlideObject } from "@tumblerjs/slides";
  let {
    pattern,
    id,
  }: { pattern: NonNullable<SlideObject["pattern"]>; id: string } = $props();
  let preset = $derived(pattern.preset),
    size = $derived(preset.startsWith("sm") || preset.startsWith("lt") ? 4 : 8);
  const bayer = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
    14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
    51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55,
    23, 61, 29, 53, 21,
  ];
</script>

<pattern
  {id}
  patternUnits="userSpaceOnUse"
  width={preset.startsWith("pct") ? 8 : size}
  height={preset.startsWith("pct") ? 8 : size}
>
  <rect width="100%" height="100%" fill={pattern.background} />
  {#if preset.startsWith("pct")}{#each bayer as threshold, i}{#if threshold < Number(preset.slice(3)) * 0.64}<rect
          x={i % 8}
          y={Math.floor(i / 8)}
          width="1"
          height="1"
          fill={pattern.foreground}
        />{/if}{/each}
  {:else if /Check/.test(preset)}<path
      d={`M0 0H${size / 2}V${size / 2}H0Z M${size / 2} ${size / 2}H${size}V${size}H${size / 2}Z`}
      fill={pattern.foreground}
    />
  {:else if /Dot/.test(preset)}<circle
      cx="1"
      cy="1"
      r="0.7"
      fill={pattern.foreground}
    />
  {:else}<path
      d={/DnDiag/.test(preset)
        ? `M0 0L${size} ${size} M-${size / 2} ${size / 2}L${size / 2} ${size * 1.5} M${size / 2} -${size / 2}L${size * 1.5} ${size / 2}`
        : /UpDiag/.test(preset)
          ? `M0 ${size}L${size} 0 M-${size / 2} ${size / 2}L${size / 2} -${size / 2} M${size / 2} ${size * 1.5}L${size * 1.5} ${size / 2}`
          : preset === "diagCross"
            ? `M0 0L${size} ${size} M0 ${size}L${size} 0`
            : /Horz/.test(preset) || preset === "horz"
              ? `M0 0H${size}`
              : /Vert/.test(preset) || preset === "vert"
                ? `M0 0V${size}`
                : `M0 0H${size} M0 0V${size}`}
      stroke={pattern.foreground}
      stroke-width={preset.startsWith("dk")
        ? 3
        : preset.startsWith("wd")
          ? 2
          : 1}
    />{/if}
</pattern>
