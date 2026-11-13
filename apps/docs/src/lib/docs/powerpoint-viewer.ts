import type { Doc } from './types';

export const powerpointViewerDoc: Doc = {
  title: 'Render a presentation',
  description: 'Open a PPTX file and show a slide with Svelte.',
  sections: [
    { id: 'setup', title: 'Get the file\'s bytes', blocks: [
      { kind: 'text', text: 'Tumbler opens a PPTX from a `Uint8Array`, so the file can come from an upload, `fetch` or your own storage. The examples on these pages take the bytes as a component prop.' },
      { kind: 'code', code: `const bytes = new Uint8Array(await file.arrayBuffer());` },
    ] },
    { id: 'viewer', title: 'Show a slide', blocks: [
      { kind: 'text', text: '`openPresentationArtifact` parses the file. Pass its `document` as `presentation`, and one of `document.slides` as `slide`.' },
      { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import { untrack } from 'svelte';
  import { openPresentationArtifact } from '@tumblerjs/slides';
  import { PresentationSlideView } from '@tumblerjs/svelte/slides';

  let { bytes }: { bytes: Uint8Array } = $props();
  const artifact = untrack(() => openPresentationArtifact(bytes));
  let scale = $state(1);
</script>

<div style="height: 540px; min-width: 0">
  {#if artifact.document.slides[0]}
    <PresentationSlideView
      presentation={artifact.document}
      slide={artifact.document.slides[0]}
      bind:scale
    />
  {/if}
</div>` },
      { kind: 'list', items: [
        'Give the container a height. The view scales the slide to fit it.',
        '`scale` is `1` when the slide fits the container. Bind it to keep your own zoom controls in step with pinch gestures.',
        'The example opens the file once, when the component is created. To show a different file, create the component again, for example with a `{#key}` block.',
      ] },
      { kind: 'link', href: '/components/presentation-slide-view', label: 'PresentationSlideView props and live example' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint-viewer.ts',
  next: { href: '/docs/powerpoint-navigation', label: 'Slide navigation' },
};
