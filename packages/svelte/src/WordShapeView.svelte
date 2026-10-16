<script lang="ts">
  import { resolveWordColour, wordShapePath, type WordAuthoredShape } from '@tumblerjs/word';
  let { shape, editing = false, initialText, oncommit }: {
    shape: WordAuthoredShape;
    /** Edits the shape's text in place, as Word does after a double-click. */
    editing?: boolean;
    /** Text to start editing with when it differs from the shape's, such as a typed first character. */
    initialText?: string;
    /** Receives the text when editing ends. Escape keeps the text, as in Word, and leaves the shape selected. */
    oncommit?: (text: string, reason: 'blur' | 'escape') => void;
  } = $props();
  let finished = false;

  function fit(area: HTMLTextAreaElement) {
    area.style.height = '0';
    area.style.height = `${area.scrollHeight}px`;
  }
  function edit(area: HTMLTextAreaElement) {
    finished = false;
    area.value = initialText ?? shape.text ?? '';
    fit(area);
    area.focus({ preventScroll: true });
    area.setSelectionRange(area.value.length, area.value.length);
  }
  function finish(area: HTMLTextAreaElement, reason: 'blur' | 'escape') {
    if (finished) return;
    finished = true;
    oncommit?.(area.value, reason);
  }
</script>
<div class="shape" role="img" aria-label={shape.alt ?? shape.text ?? shape.preset}>
  <svg viewBox={`0 0 ${shape.width} ${shape.height}`} preserveAspectRatio="none" aria-hidden="true">
    <path d={wordShapePath(shape)} fill={resolveWordColour(shape.fill)} stroke={resolveWordColour(shape.outline)} stroke-width={shape.outlineWidth} />
  </svg>
  {#if editing}
    <div class="text">
      <textarea
        aria-label="Shape text"
        spellcheck="true"
        rows="1"
        use:edit
        oninput={(event) => fit(event.currentTarget)}
        onblur={(event) => finish(event.currentTarget, 'blur')}
        onkeydown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') { event.preventDefault(); finish(event.currentTarget, 'escape'); }
        }}
      ></textarea>
    </div>
  {:else if shape.text}<div class="text"><span>{shape.text}</span></div>{/if}
</div>
<style>
  .shape { position: relative; width: 100%; height: 100%; }
  svg { display: block; width: 100%; height: 100%; }
  .text { position: absolute; inset: 6px; display: grid; place-content: center; overflow: hidden; }
  span, textarea { text-align: center; white-space: pre-wrap; overflow-wrap: break-word; color: #000; font: 16px Aptos, sans-serif; }
  textarea { box-sizing: border-box; width: 100%; max-height: 100%; min-width: 1ch; margin: 0; padding: 0; border: 0; outline: none; background: transparent; resize: none; overflow: hidden; caret-color: #000; }
  .text:has(textarea) { place-content: center stretch; }
</style>
