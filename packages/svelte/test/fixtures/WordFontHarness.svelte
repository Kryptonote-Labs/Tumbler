<script lang="ts">
  import type { WordDocument } from '@tumblerjs/word';
  import type { EmbeddedFontContext } from '../../src/embedded-fonts.ts';
  import type { WordViewLayout } from '../../src/word-view-state.ts';
  import WordDocumentView from '../../src/WordDocumentView.svelte';
  let { initial, fonts, onlayoutchange }: { initial: WordDocument; fonts: EmbeddedFontContext; onlayoutchange?: (layout: WordViewLayout) => void } = $props();
  let model = $state(initial);
  let context = $state(fonts);
  export function setDocument(next: WordDocument, nextFonts: EmbeddedFontContext) {
    model = next;
    context = nextFonts;
  }
</script>
<WordDocumentView wordDocument={model} fontContext={context} {onlayoutchange} />
