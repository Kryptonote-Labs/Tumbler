<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import type { PresentationDocument } from "@tumblerjs/slides";
  import PresentationSlideView from "./PresentationSlideView.svelte";
  let {
    presentation,
    index = $bindable(0),
  }: { presentation: PresentationDocument; index?: number } = $props();
  let rail = $state<HTMLElement>();
  let visible = $state<Record<string, boolean>>({});
  let rendered = $state<Record<string, boolean>>({});
  let frame = 0;
  // Mount one nearby preview per frame so a scroll jump does not build a row
  // of full slide renderers in one task. The selected slide renders immediately.
  function revealNext() {
    frame = 0;
    const next = Object.keys(visible).find(
      (id) => visible[id] && !rendered[id],
    );
    if (!next) return;
    rendered[next] = true;
    frame = requestAnimationFrame(revealNext);
  }
  onDestroy(() => cancelAnimationFrame(frame));
  function observe(node: HTMLElement, id: string) {
    const observer = new IntersectionObserver(
      (entries) => {
        visible[id] = entries[0]?.isIntersecting ?? false;
        if (!visible[id]) rendered[id] = false;
        else if (!frame) frame = requestAnimationFrame(revealNext);
      },
      { root: rail, rootMargin: "160px" },
    );
    observer.observe(node);
    return {
      destroy() {
        observer.disconnect();
        delete visible[id];
        delete rendered[id];
      },
    };
  }
  $effect(() => {
    const active = index;
    void tick().then(() => {
      const button = rail?.querySelector<HTMLButtonElement>(
        `button[data-index="${active}"]`,
      );
      if (!button || !rail) return;
      if (button.offsetTop < rail.scrollTop) rail.scrollTop = button.offsetTop;
      else if (
        button.offsetTop + button.offsetHeight >
        rail.scrollTop + rail.clientHeight
      )
        rail.scrollTop =
          button.offsetTop + button.offsetHeight - rail.clientHeight;
    });
  });
  async function navigate(event: KeyboardEvent, current: number) {
    const last = presentation.slides.length - 1;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? Math.min(last, current + 1)
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? Math.max(0, current - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    index = next;
    await tick();
    rail
      ?.querySelector<HTMLButtonElement>(`button[data-index="${next}"]`)
      ?.focus({ preventScroll: true });
  }
</script>

<nav class="slide-rail" aria-label="Slides" bind:this={rail}>
  {#each presentation.slides as slide, i (slide.id)}
    <button
      data-index={i}
      class:active={index === i}
      aria-current={index === i ? "true" : undefined}
      aria-label={`Slide ${i + 1}: ${slide.title}${slide.hidden ? " (hidden)" : ""}`}
      tabindex={index === i ? 0 : -1}
      onclick={() => (index = i)}
      onkeydown={(event) => navigate(event, i)}
    >
      <span class="number">{i + 1}</span>
      <span
        class="preview"
        aria-hidden="true"
        inert
        use:observe={slide.id}
        style:aspect-ratio={`${presentation.width}/${presentation.height}`}
      >
        <span class="preview-surface"
          >{#if rendered[slide.id] || index === i}<PresentationSlideView
              {presentation}
              {slide}
              thumbnail
            />{/if}</span
        >
      </span>
    </button>
  {/each}
</nav>

<style>
  .slide-rail {
    position: relative;
    height: 100%;
    overflow: auto;
    padding: 12px 8px;
    background: #181b19;
    border-right: 1px solid #333a35;
    box-sizing: border-box;
  }
  button {
    display: flex;
    gap: 7px;
    align-items: flex-start;
    width: 100%;
    border: 0;
    background: transparent;
    color: #acb9ae;
    padding: 5px 3px;
    margin: 0 0 10px;
    border-radius: 3px;
    cursor: pointer;
    box-sizing: border-box;
  }
  .number {
    font:
      11px Arial,
      sans-serif;
    padding-top: 3px;
    min-width: 16px;
    text-align: right;
  }
  .preview {
    position: relative;
    contain: layout paint;
    display: block;
    flex: 1;
    min-width: 0;
    background: white;
    border: 2px solid transparent;
    box-shadow: 0 1px 3px #0005;
    overflow: hidden;
  }
  .preview-surface {
    position: absolute;
    inset: 0;
  }
  .active .preview {
    border-color: #82b68e;
  }
  button:hover .preview {
    border-color: #647e6a;
  }
  button:focus-visible {
    outline: 2px solid #82b68e;
    outline-offset: 0;
  }
  .active .number {
    color: #c8e5cf;
  }
</style>
