import type { Doc } from './types';

export const powerpointNavigationDoc: Doc = {
  title: 'Slide navigation',
  description: 'Connect thumbnails and internal slide links to the active slide.',
  sections: [
    { id: 'navigation', title: 'Add slide navigation', blocks: [
        { kind: 'text', text: 'Bind PresentationSlideRail to an index and use that index for the main view. Handle onslide so links inside the presentation can switch slides too.' },
        { kind: 'code', language: 'Svelte', code: `<script lang="ts">
  import type { PresentationDocument } from '@tumblerjs/slides';
  import { PresentationSlideRail, PresentationSlideView } from '@tumblerjs/svelte/slides';

  let { presentation }: { presentation: PresentationDocument } = $props();
  let index = $state(0);
</script>

<div style="display: flex; height: 540px; min-width: 0">
  <aside style="width: 150px; flex-shrink: 0">
    <PresentationSlideRail {presentation} bind:index />
  </aside>
  <div style="flex: 1; min-width: 0">
    {#if presentation.slides[index]}
      <PresentationSlideView
        {presentation}
        slide={presentation.slides[index]!}
        onslide={(part) => {
          const next = presentation.slides.findIndex(slide => slide.part === part);
          if (next >= 0) index = next;
        }}
      />
    {/if}
  </div>
</div>` },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint-navigation.ts',
  next: { href: '/docs/powerpoint-editing', label: 'Edit slides' },
};
