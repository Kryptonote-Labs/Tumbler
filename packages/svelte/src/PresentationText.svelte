<script lang="ts">
  import { cssFontFamily } from "./font-family.ts";
  import { getContext } from "svelte";
  import {
    presentationFontContext,
    type PresentationFontContext,
  } from "./presentation-fonts.ts";
  const fonts = getContext<PresentationFontContext | undefined>(
    presentationFontContext,
  );
  import {
    presentationTextEdit,
    type SlideTextEditorOptions,
  } from "./presentation-text-edit.ts";
  import { presentationTabs } from "./presentation-tabs.ts";
  import { presentationTextLayout } from "./presentation-text-layout.ts";
  import { slideParagraphFontSize, type SlideText } from "@tumblerjs/slides";
  import PresentationEquation from "./PresentationEquation.svelte";
  let {
    text,
    onslide,
    editor,
    onheight,
    linksEnabled = true,
  }: {
    text: SlideText;
    linksEnabled?: boolean;
    onheight?: (height: number) => void;
    onslide?: (part: string) => void;
    editor?: Omit<SlideTextEditorOptions, "paragraphs">;
  } = $props();
  let vertical = $derived(text.direction && text.direction !== "horz");
  // Text offset where each run starts, so equations know the character they occupy.
  const runStarts = $derived.by(() => {
    let offset = 0;
    return text.paragraphs.map((paragraph) => {
      const starts = paragraph.runs.map((run) => (offset += run.text.length) - run.text.length);
      offset++;
      return starts;
    });
  });
</script>

<div
  class="slide-text"
  use:presentationTextLayout={{ text, onheight }}
  style:justify-content={text.anchor === "center"
    ? "center"
    : text.anchor === "bottom"
      ? "flex-end"
      : "flex-start"}
  style:padding={text.inset.map((value) => `${value}px`).join(" ")}
  style:overflow-x={text.horizontalOverflow === "clip" ? "clip" : "visible"}
  style:overflow-y={text.verticalOverflow === "clip" ||
  text.verticalOverflow === "ellipsis"
    ? "clip"
    : "visible"}
  style:white-space={text.wrap ? "pre-wrap" : "pre"}
  style:overflow-wrap={text.wrap ? "anywhere" : undefined}
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
    {#each text.paragraphs as paragraph, paragraphIndex}
      {@const base = paragraph.runs[0] ?? paragraph.endRun}
      {@const family = base?.fontFamily ?? "Arial"}
      <p
        use:presentationTabs={paragraph}
        data-text-paragraph
        dir={paragraph.rtl ? "rtl" : "ltr"}
        style:font-family={fonts?.family(family) ?? cssFontFamily(family)}
        style:font-size={`${slideParagraphFontSize(paragraph)}px`}
        style:font-weight={base?.bold ? 700 : 400}
        style:font-style={base?.italic ? "italic" : "normal"}
        style:text-align={paragraph.align}
        style:text-align-last={paragraph.distributed ? "justify" : undefined}
        style:text-justify={paragraph.distributed
          ? "inter-character"
          : undefined}
        style:margin-right={`${paragraph.marginRight ?? 0}px`}
        style:margin-left={`${paragraph.marginLeft}px`}
        style:text-indent={`${paragraph.indent}px`}
        style:margin-top={`${paragraph.before}px`}
        style:margin-bottom={`${paragraph.after}px`}
        style:line-height={typeof paragraph.lineHeight === "number" ? "normal" : paragraph.lineHeight}
      >
        {#if paragraph.bullet && (editor?.active || paragraph.runs.some(run => run.text.trim()))}<span
            data-bullet
            contenteditable="false"
            style:font-family={fonts?.family(paragraph.bulletFont ?? family) ??
              cssFontFamily(paragraph.bulletFont ?? family)}
            style:color={paragraph.bulletColor}
            style:font-size={`${paragraph.bulletSize ?? base?.fontSize ?? 24}px`}
            style:display="inline-block"
            style:min-width={`${Math.max(0, -paragraph.indent)}px`}
            >{paragraph.bullet}
          </span>{/if}{#each paragraph.runs as run, runIndex}{#if run.equation}<PresentationEquation
              run={{ ...run, equation: run.equation }}
              start={runStarts[paragraphIndex]?.[runIndex] ?? 0}
              fontFamily={fonts?.family(run.fontFamily) ?? cssFontFamily(run.fontFamily)}
              {editor}
            />{:else}<span
            data-text-run
            style:font-family={fonts?.family(run.fontFamily) ??
              cssFontFamily(run.fontFamily)}
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
                href={run.hyperlink.href && /^(https?|mailto|tel):/i.test(run.hyperlink.href) ? run.hyperlink.href : "#"}
                target={run.hyperlink.href ? "_blank" : undefined}
                rel="noopener noreferrer"
                onclick={(event) => {
                  if (!linksEnabled || editor?.active || (run.hyperlink?.href && !/^(https?|mailto|tel):/i.test(run.hyperlink.href))) {
                    event.preventDefault();
                    return;
                  }
                  if (run.hyperlink?.slidePart) {
                    event.preventDefault();
                    onslide?.(run.hyperlink.slidePart);
                  }
                }}
                onkeydown={(event) => event.stopPropagation()}>{run.text}</a
              >{:else}{#each run.text.split(/(\t)/) as piece}{#if piece === "\t"}<span
                    data-tab
                    style="display:inline-block;white-space:pre">{piece}</span
                  >{:else}{piece}{/if}{/each}{/if}</span
          >{/if}{/each}{#if paragraph.runs.length === 0}<br />{/if}
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
    flex-shrink: 0;
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
  }
  a {
    color: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
