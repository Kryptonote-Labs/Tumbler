import type { Doc } from './types';

export const powerpointNavigationDoc: Doc = {
  title: 'Slide navigation',
  description: 'Add thumbnails, and follow links from one slide to another.',
  sections: [
    { id: 'navigation', title: 'Add thumbnails', blocks: [
      { kind: 'text', text: '`PresentationSlideRail` shows a thumbnail of every slide. Bind its `index` to a variable, and use the same variable to choose the slide in the main view. Clicking a thumbnail then changes the slide.' },
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
    { id: 'links', title: 'Follow links between slides', blocks: [
      { kind: 'text', text: 'When the user clicks a link to another slide, the view calls `onslide` with that slide\'s `part`. Find the slide with that `part` and set `index`, as in the example above. Without `onslide`, these links do nothing.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/powerpoint-navigation.ts',
  next: { href: '/docs/powerpoint-editing', label: 'Edit slides' },
};
