<script lang="ts">
  import { wordDisplayColour } from './word-display-colour.ts';
  import { wordColumnSeparators, wordPointsToCssPixels, type WordLayoutPage } from '@tumblerjs/word';
  import { wordTextCss, wordTextTop } from './word-font-metrics.ts';
  let { page, background = '#ffffff' }: { page: WordLayoutPage; background?: string | undefined } = $props();
</script>

{#each wordColumnSeparators(page) as line}
  <span aria-hidden="true" style={`position:absolute;pointer-events:none;left:${wordPointsToCssPixels(line.x)}px;top:${wordPointsToCssPixels(line.y)}px;height:${wordPointsToCssPixels(line.height)}px;border-left:1px solid ${wordDisplayColour('#000000')}`}></span>
{/each}

{#each page.columns.flatMap(column => column.lines) as line}
  {#if line.lineNumber}
    {@const number = line.lineNumber}
    <span aria-hidden="true" style={`position:absolute;pointer-events:none;user-select:none;${wordTextCss(number.format, background)};left:${wordPointsToCssPixels(number.x)}px;top:${wordPointsToCssPixels(wordTextTop(number))}px;line-height:${wordPointsToCssPixels(number.height)}px`}>{number.text}</span>
  {/if}
{/each}
