import type { Doc } from './types';

export const powerpointViewerDoc: Doc = {
  title: 'Render a presentation',
  description: 'Open a PPTX and render one slide with Svelte.',
  sections: [
    { id: 'setup', title: 'Open a file', blocks: [
        { kind: 'text', text: 'Read your PPTX file into a Uint8Array. The examples below accept these bytes as a component prop.' },
        { kind: 'code', code: `const bytes = new Uint8Array(await file.arrayBuffer());` },
    ] },
    { id: 'viewer', title: 'Render a slide', blocks: [
        { kind: 'text', text: 'Open the bytes with openPresentationArtifact and pass its document and a slide to PresentationSlideView. Give the viewer a fixed height so it can size the slide.' },
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
        { kind: 'text', text: 'A scale of 1 fits the slide to the viewer. Bind scale to keep zoom controls in sync with pinch gestures. These examples open one file per component instance; remount the component when loading another file.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint-viewer.ts',
  next: { href: '/docs/powerpoint-navigation', label: 'Slide navigation' },
};
