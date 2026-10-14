<script lang="ts">
  import type { WordAuthoredShape } from '@tumblerjs/word';
  let { shape, editing = false, initialText, oncommit }: {
    shape: WordAuthoredShape;
    /** Edits the shape's text in place, as Word does after a double-click. */
    editing?: boolean;
    /** Text to start editing with when it differs from the shape's, such as a typed first character. */
    initialText?: string;
    /** Receives the text when editing ends. Escape keeps the text, as in Word, and leaves the shape selected. */
    oncommit?: (text: string, reason: 'blur' | 'escape') => void;
  } = $props();
  const paths = $derived({
    triangle: `M${shape.width / 2} 1 L${shape.width - 1} ${shape.height - 1} L1 ${shape.height - 1} Z`,
    diamond: `M${shape.width / 2} 1 L${shape.width - 1} ${shape.height / 2} L${shape.width / 2} ${shape.height - 1} L1 ${shape.height / 2} Z`,
    rightArrow: `M1 ${shape.height * .3} H${shape.width * .6} V1 L${shape.width - 1} ${shape.height / 2} L${shape.width * .6} ${shape.height - 1} V${shape.height * .7} H1 Z`,
    line: `M1 ${shape.height - 1} L${shape.width - 1} 1`,
  });
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
    <g fill={shape.fill} stroke={shape.outline} stroke-width={shape.outlineWidth}>
      {#if shape.preset === 'ellipse'}<ellipse cx={shape.width / 2} cy={shape.height / 2} rx={Math.max(0, shape.width / 2 - 1)} ry={Math.max(0, shape.height / 2 - 1)} />
      {:else if shape.preset === 'rect' || shape.preset === 'roundRect'}<rect x="1" y="1" width={Math.max(0, shape.width - 2)} height={Math.max(0, shape.height - 2)} rx={shape.preset === 'roundRect' ? Math.min(shape.width, shape.height) * .12 : 0} />
      {:else}<path d={paths[shape.preset]} />{/if}
    </g>
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
