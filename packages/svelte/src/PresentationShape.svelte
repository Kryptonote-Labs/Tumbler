<script lang="ts">
  import type { SlideObject } from "@tumblerjs/slides";
  import PresentationEffects from "./PresentationEffects.svelte";
  import PresentationPattern from "./PresentationPattern.svelte";
  import PresentationPictureFill from "./PresentationPictureFill.svelte";
  import PresentationGradient from "./PresentationGradient.svelte";
  let {
    object,
    width,
    height,
    id,
  }: { object: SlideObject; width: number; height: number; id: string } =
    $props();
  let fill = $derived(
    object.pattern
      ? `url(#${id}-pattern)`
      : object.pictureFill
        ? `url(#${id}-picture)`
        : object.gradient
          ? `url(#${id}-fill)`
          : object.fill,
  );
</script>

<defs>
  {#if object.pictureFill}<PresentationPictureFill
      picture={object.pictureFill}
      id={`${id}-picture`}
      width={object.transform.width}
      height={object.transform.height}
    />{/if}
  {#if object.gradient}<PresentationGradient
      gradient={object.gradient}
      id={`${id}-fill`}
      width={object.transform.width}
      height={object.transform.height}
    />{/if}
  {#if object.pattern}<PresentationPattern
      pattern={object.pattern}
      id={`${id}-pattern`}
    />{/if}
  {#if object.shadow || object.effects?.length}<PresentationEffects
      {object}
      id={`${id}-shadow`}
    />{/if}
  {#each [{ end: object.head, suffix: "head" }, { end: object.tail, suffix: "tail" }] as { end, suffix }}
    {#if end}<marker
        id={`${id}-${suffix}`}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth={end.length}
        markerHeight={end.width}
        orient="auto-start-reverse"
        markerUnits="strokeWidth"
        overflow="visible"
      >
        {#if end.type === "oval"}<ellipse
            cx="5"
            cy="5"
            rx="5"
            ry="5"
            fill={object.stroke}
          />
        {:else if end.type === "diamond"}<path
            d="M0 5 L5 0 L10 5 L5 10 Z"
            fill={object.stroke}
          />
        {:else}<path
            d={end.type === "stealth"
              ? "M0 0 L10 5 L0 10 L3 5 Z"
              : end.type === "arrow"
                ? "M0 0 L10 5 L0 10"
                : "M0 0 L10 5 L0 10 Z"}
            fill={end.type === "arrow" ? "none" : object.stroke}
            stroke={object.stroke}
            stroke-width={end.type === "arrow" ? 1 : 0}
          />{/if}
      </marker>{/if}
  {/each}
</defs>
<g
  transform={`scale(${object.transform.width === 0 ? 1 : width / object.transform.width} ${object.transform.height === 0 ? 1 : height / object.transform.height})`}
  filter={object.shadow || object.effects?.length
    ? `url(#${id}-shadow)`
    : undefined}
>
  {#each object.drawingGeometry?.paths ?? [] as path}
    <path
      d={path.d}
      fill={path.fill === "none" ? "none" : fill}
      stroke={path.stroke ? object.stroke : "none"}
      stroke-width={object.strokeWidth}
      stroke-dasharray={object.strokeDash}
      stroke-linecap={object.strokeCap}
      stroke-linejoin="round"
      marker-start={object.head ? `url(#${id}-head)` : undefined}
      marker-end={object.tail ? `url(#${id}-tail)` : undefined}
    />
    {#if path.fill.startsWith("darken") || path.fill.startsWith("lighten")}<path
        d={path.d}
        fill={path.fill.startsWith("darken") ? "black" : "white"}
        opacity={path.fill.endsWith("Less") ? 0.2 : 0.4}
        pointer-events="none"
      />{/if}
  {/each}
</g>
