<script lang="ts">
  import { wordColumnSeparators, wordPointsToCssPixels, type WordLayoutPage } from '@tumblerjs/word';
  let { page }: { page: WordLayoutPage } = $props();
</script>

{#each wordColumnSeparators(page) as line}
  <span aria-hidden="true" style={`position:absolute;pointer-events:none;left:${wordPointsToCssPixels(line.x)}px;top:${wordPointsToCssPixels(line.y)}px;height:${wordPointsToCssPixels(line.height)}px;border-left:1px solid #000`}></span>
{/each}
