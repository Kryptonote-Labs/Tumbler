<script lang="ts">
  import { wordDisplayColour } from './word-display-colour.ts';
  import { wordColumnSeparators, wordFontFamily, wordPointsToCssPixels, type WordLayoutPage } from '@tumblerjs/word';
  import { wordTextCss, wordTextTop } from './word-font-metrics.ts';
  let { page, background = '#ffffff', fontFamily = wordFontFamily }: {
    page: WordLayoutPage;
    background?: string | undefined;
    /** Resolve the same CSS font stack used by the host's layout measurer and body text. */
    fontFamily?: (family: string) => string;
  } = $props();
</script>

{#each wordColumnSeparators(page) as line}
  <span aria-hidden="true" contenteditable="false" style={`position:absolute;pointer-events:none;left:${wordPointsToCssPixels(line.x)}px;top:${wordPointsToCssPixels(line.y)}px;height:${wordPointsToCssPixels(line.height)}px;border-left:1px solid ${wordDisplayColour('#000000')}`}></span>
{/each}

{#each page.columns.flatMap(column => column.lines) as line}
  {#if line.lineNumber}
    {@const number = line.lineNumber}
    {@const family = fontFamily(number.format.fontFamily)}
    <span aria-hidden="true" contenteditable="false" style={`position:absolute;pointer-events:none;user-select:none;${wordTextCss(number.format, background)};font-family:${family};left:${wordPointsToCssPixels(number.x)}px;top:${wordPointsToCssPixels(wordTextTop(number, family))}px;line-height:${wordPointsToCssPixels(number.height)}px`}>{number.text}</span>
  {/if}
{/each}
