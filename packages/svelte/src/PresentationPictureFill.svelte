<script lang="ts">
  import { presentationImageUrl } from "./presentation-image-url.ts";
  import { metafileSvg } from "./presentation-metafiles.ts";
  import { drawingPictureGeometry, type DrawingPictureFill } from "@tumblerjs/ooxml";
  let {
    picture,
    id,
    width,
    height,
    origin = { x: 0, y: 0 },
  }: {
    picture: DrawingPictureFill;
    id: string;
    width: number;
    height: number;
    origin?: { readonly x: number; readonly y: number };
  } = $props();
  let url = $state(""),
    natural = $state({ width: 1, height: 1 });
  $effect(() => {
    const current = picture;
    if (!current.bytes.length) { url = ""; return; }
    let disposed = false,
      src = "";
    const image = current.tile ? new Image() : undefined;
    let release: (() => void) | undefined;
    const show = (blob: Blob) => {
      if (disposed) return;
      src = URL.createObjectURL(blob);
      url = src;
      if (image) {
        image.onload = () =>
          (natural = {
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        image.src = src;
      }
    };
    if (/(?:emf|wmf)$/.test(current.contentType))
      void metafileSvg(current.bytes, current.contentType)
        .then((svg) => show(new Blob([svg], { type: "image/svg+xml" })))
        .catch(() => {
          if (!disposed) url = "";
        });
    else {
      const resource = presentationImageUrl(current.bytes, current.contentType);
      release = resource.release;
      url = resource.url;
      if (image) {
        image.onload = () =>
          (natural = {
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
        image.src = url;
      }
    }
    return () => {
      disposed = true;
      if (image) image.onload = null;
      release?.();
      if (src) URL.revokeObjectURL(src);
    };
  });

  const geometry = $derived(drawingPictureGeometry(picture, width, height, natural));
</script>

{#if geometry}
  {@const { x, y, width: w, height: h, destination, image, flipX, flipY, reverseX, reverseY } = geometry}
  <pattern {id} patternUnits="userSpaceOnUse" x={x + origin.x} y={y + origin.y} width={w * (flipX ? 2 : 1)} height={h * (flipY ? 2 : 1)} viewBox={`0 0 ${w * (flipX ? 2 : 1)} ${h * (flipY ? 2 : 1)}`} preserveAspectRatio="none">
    {#each Array.from({ length: flipY ? 2 : 1 }) as _, row}{#each Array.from({ length: flipX ? 2 : 1 }) as _, column}
      {@const mirrorX = reverseX !== (column === 1)}
      {@const mirrorY = reverseY !== (row === 1)}
      <g opacity={picture.opacity ?? 1} transform={`translate(${column * w + (mirrorX ? w : 0)} ${row * h + (mirrorY ? h : 0)}) scale(${mirrorX ? -1 : 1} ${mirrorY ? -1 : 1})`}>
        <svg x={destination.x} y={destination.y} width={destination.width} height={destination.height} overflow="hidden">
          <image href={url} x={image.x} y={image.y} width={image.width} height={image.height} preserveAspectRatio="none" />
        </svg>
      </g>
    {/each}{/each}
  </pattern>
{/if}
