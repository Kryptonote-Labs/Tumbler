<script lang="ts">
  import {
    presentationTextEdit,
    type SlideTextEditorOptions,
  } from "./presentation-text-edit.ts";
  import { presentationTextLayout } from "./presentation-text-layout.ts";
  import type { SlideText } from "@tumblerjs/slides";
  let {
    text,
    onslide,
    editor,
    onheight,
  }: {
    text: SlideText;
    onheight?: (height: number) => void;
    onslide?: (part: string) => void;
    editor?: Omit<SlideTextEditorOptions, "paragraphs">;
  } = $props();
  let vertical = $derived(text.direction && text.direction !== "horz");
</script>

<div
  class="slide-text"
  use:presentationTextLayout={{text, onheight}}
  style:justify-content={text.anchor === "center"
    ? "center"
    : text.anchor === "bottom"
      ? "flex-end"
      : "flex-start"}
  style:padding={text.inset.map((value) => `${value}px`).join(" ")}
  style:overflow-x={text.horizontalOverflow === "clip" ? "clip" : "visible"}
  style:overflow-y={text.verticalOverflow === "clip" || text.verticalOverflow === "ellipsis" ? "clip" : "visible"}
  style:white-space={text.wrap ? "pre-wrap" : "pre"}
  style:transform={`rotate(${(text.rotation ?? 0) + (text.direction === "vert270" ? 180 : 0)}deg)`}
>
  <div
    class="paragraphs"
    contenteditable={editor?.active ?? false}
    role={editor?.active ? "textbox" : undefined}
    aria-label={editor?.active ? "Edit slide text" : undefined}
    aria-multiline={editor?.active ? true : undefined}
    use:presentationTextEdit={{
      ...editor,
      active: editor?.active ?? false,
      revision: text,
      paragraphs: text.paragraphs.map((p) =>
        p.runs.map((r) => r.text).join(""),
      ),
    }}
    class:columns={(text.columns ?? 1) > 1}
    class:vertical
    style:column-count={text.columns ?? 1}
    style:column-gap={`${text.columnGap ?? 0}px`}
    style:writing-mode={vertical ? "vertical-rl" : "horizontal-tb"}
    style:tab-size={`${text.tabSize ?? 96}px`}
  >
    {#each text.paragraphs as paragraph}
      <p
        data-text-paragraph
        dir={paragraph.rtl ? "rtl" : "ltr"}
        style:font-size={`${paragraph.fontSize ?? Math.max(1, ...paragraph.runs.map((run) => run.fontSize))}px`}
        style:text-align={paragraph.align}
        style:margin-left={`${paragraph.marginLeft}px`}
        style:text-indent={`${paragraph.indent}px`}
        style:margin-top={`${paragraph.before}px`}
        style:margin-bottom={`${paragraph.after}px`}
        style:line-height={paragraph.lineHeight}
      >
        {#if paragraph.bullet}<span
            data-bullet
            contenteditable="false"
            style:font-family={paragraph.bulletFont}
            style:color={paragraph.bulletColor}
            style:font-size={`${paragraph.bulletSize ?? 24}px`}
            >{paragraph.bullet}
          </span>{/if}{#each paragraph.runs as run}<span
            data-text-run
            style:font-family={run.fontFamily}
            style:font-size={`${run.fontSize}px`}
            style:font-weight={run.bold ? 700 : 400}
            style:font-style={run.italic ? "italic" : "normal"}
            style:text-decoration={`${run.underline ? "underline " : ""}${run.strike ? "line-through" : ""}`}
            style:color={run.color}
            style:letter-spacing={`${run.spacing ?? 0}px`}
            style:text-transform={run.capitals === "all" ? "uppercase" : "none"}
            style:font-variant={run.capitals === "small"
              ? "small-caps"
              : "normal"}
            style:position={run.baseline ? "relative" : undefined}
            style:top={`${-(run.baseline ?? 0) * run.fontSize}px`}
            >{#if run.hyperlink}<a
                href={run.hyperlink.href ?? "#"}
                target={run.hyperlink.href ? "_blank" : undefined}
                rel="noopener noreferrer"
                onclick={(event) => {
                  if (run.hyperlink?.slidePart) {
                    event.preventDefault();
                    onslide?.(run.hyperlink.slidePart);
                  }
                }}
                onkeydown={(event) => event.stopPropagation()}>{run.text}</a
              >{:else}{run.text}{/if}</span
          >{/each}{#if paragraph.runs.length === 0}<br />{/if}
      </p>
    {/each}
  </div>
</div>

<style>
  .slide-text {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow: visible;
    color: #222;
    font:
      24px Arial,
      sans-serif;
    user-select: text;
  }
  .paragraphs:focus {
    outline: none;
  }
  .paragraphs[contenteditable="true"] {
    cursor: text;
  }
  .paragraphs {
    width: 100%;
  }
  .paragraphs.columns,
  .paragraphs.vertical {
    height: 100%;
    column-fill: auto;
  }
  .slide-text p {
    margin: 0;
    padding: 0;
    color: inherit;
    flex-shrink: 0;
    font: inherit;
    min-height: 1em;
  }
  a {
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
