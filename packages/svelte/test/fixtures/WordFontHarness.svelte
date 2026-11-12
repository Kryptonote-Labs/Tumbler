<script lang="ts">
  import type { WordDocument } from '@tumblerjs/word';
  import type { EmbeddedFontContext } from '../../src/embedded-fonts.ts';
  import WordDocumentView from '../../src/WordDocumentView.svelte';
  let { initial, fonts }: { initial: WordDocument; fonts: EmbeddedFontContext } = $props();
  let model = $state(initial);
  let context = $state(fonts);
  export function setDocument(next: WordDocument, nextFonts: EmbeddedFontContext) {
    model = next;
    context = nextFonts;
  }
</script>
<WordDocumentView wordDocument={model} fontContext={context} />
