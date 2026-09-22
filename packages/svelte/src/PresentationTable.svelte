<script lang="ts">
  import type {
    SlideTable,
    PresentationTableCellAddress,
  } from "@tumblerjs/slides";
  import type { SlideTextEditorOptions } from "./presentation-text-edit.ts";
  import PresentationText from "./PresentationText.svelte";
  let {
    table,
    width,
    height,
    onslide,
    editable = false,
    selectedCell,
    editing = false,
    editor,
    oncellselect,
    oncellactivate,
    onnavigate,
  }: {
    table: SlideTable;
    width: number;
    height: number;
    onslide?: (part: string) => void;
    editable?: boolean;
    selectedCell?: PresentationTableCellAddress;
    editing?: boolean;
    editor?: Omit<SlideTextEditorOptions, "paragraphs" | "active">;
    oncellselect?: (cell: PresentationTableCellAddress) => void;
    oncellactivate?: (
      cell: PresentationTableCellAddress,
      event?: MouseEvent,
    ) => void;
    onnavigate?: (backward: boolean) => boolean;
  } = $props();
  let sx = $derived(width / table.width),
    sy = $derived(height / table.height);
</script>

<svg
  {width}
  {height}
  viewBox={`0 0 ${width} ${height}`}
  role="group"
  aria-label="Table"
  class="slide-table"
>
  {#each table.cells as cell (`${cell.row}:${cell.column}`)}
    {@const selected =
      selectedCell?.row === cell.row && selectedCell?.column === cell.column}
    {@const active = selected && editing}
    {@const w = cell.width * sx}
    {@const h = cell.height * sy}
    <!-- Cell buttons expose selection outside text editing. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <g
      transform={`translate(${cell.x * sx} ${cell.y * sy})`}
      data-table-cell={`${cell.row}:${cell.column}`}
      role={editable ? "button" : "group"}
      aria-label={`Cell ${cell.row + 1}, ${cell.column + 1}`}
      tabindex={editable &&
      !active &&
      (selected || (!selectedCell && cell === table.cells[0]))
        ? 0
        : undefined}
      onpointerdown={(event) => {
        if (editable && !active) {
          event.stopPropagation();
          event.preventDefault();
          oncellselect?.(cell);
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      onfocus={() => {
        if (editable && !active) oncellselect?.(cell);
      }}
      ondblclick={(event) => {
        if (editable) {
          event.stopPropagation();
          if (!active) oncellactivate?.(cell, event);
        }
      }}
      onkeydown={(event) => {
        if (!editable || active) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          oncellactivate?.(cell);
        } else if (event.key === "Tab" && onnavigate?.(event.shiftKey)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <rect width={w} height={h} fill={cell.fill} />
      {#if cell.text}<foreignObject width={w} height={h}
          ><PresentationText
            text={cell.text}
            linksEnabled={!editable}
            {onslide}
            editor={editable ? { ...editor, active, onnavigate } : undefined}
          /></foreignObject
        >{/if}
      {#each cell.borders as border, edge}<line
          x1={edge === 1 ? w : 0}
          y1={edge === 2 ? h : 0}
          x2={edge === 3 ? 0 : w}
          y2={edge === 0 ? 0 : h}
          stroke={border.color}
          stroke-width={border.width}
          stroke-dasharray={border.dash}
          pointer-events="none"
        />{/each}
      {#if editable && !active}<rect
          class="cell-hit"
          width={w}
          height={h}
          fill="transparent"
        />{/if}
      {#if editable && selected}<rect
          width={w}
          height={h}
          fill="none"
          stroke="#278044"
          stroke-width="2"
          pointer-events="none"
        />{/if}
    </g>
  {/each}
</svg>

<style>
  .cell-hit {
    cursor: text;
    touch-action: none;
  }
</style>
