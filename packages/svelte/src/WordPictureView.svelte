<script lang="ts">
  import { wordPictureImageRect, type WordImageDrawing } from '@tumblerjs/word';
  let { drawing, src, loading = 'lazy' }: { drawing: WordImageDrawing; src: string; loading?: 'lazy' | 'eager' } = $props();
  const picture = $derived(drawing.picture);
  const rect = $derived(picture ? wordPictureImageRect(picture) : { x: 0, y: 0, width: 1, height: 1 });
</script>

<span class="picture" style:transform={picture ? `rotate(${picture.rotation}deg) scale(${picture.flipH ? -1 : 1},${picture.flipV ? -1 : 1})` : undefined}>
  <img {src} alt={drawing.altText ?? ''} draggable="false" {loading} decoding="async" style={`left:${rect.x * 100}%;top:${rect.y * 100}%;width:${rect.width * 100}%;height:${rect.height * 100}%`} />
</span>

<style>
  .picture { position: absolute; inset: 0; display: block; overflow: hidden; transform-origin: center; }
  img { position: absolute; display: block; max-width: none; }
</style>
