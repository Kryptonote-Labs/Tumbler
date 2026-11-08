<script lang="ts">
  import type { SpreadsheetDrawingObject } from '@tumblerjs/sheets';
  let { object }: { object: SpreadsheetDrawingObject } = $props();
  let url = $state<string>();
  $effect(() => {
    const image = object.image;
    if (!image) { url = undefined; return; }
    const next = URL.createObjectURL(new Blob([new Uint8Array(image.bytes)], { type: image.contentType }));
    url = next;
    return () => URL.revokeObjectURL(next);
  });
</script>
{#if url}<image href={url} width={object.width} height={object.height} preserveAspectRatio="none" />{/if}
