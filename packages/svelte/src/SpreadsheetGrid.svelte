<script lang="ts">
  import "./controls.css";
  import { onMount, tick, untrack } from "svelte";
  import { createGridSelection, moveGridSelection, type GridDirection, type GridSelection } from "@tumblerjs/core";
  import type { ChartModel } from "@tumblerjs/charts";
  import {
    EXCEL_MAX_COLUMNS,
    EXCEL_MAX_ROWS,
    clearSpreadsheetTableFilter,
    calculateSpreadsheetWorksheet,
    formatCellReference,
    parseCellReference,
    projectSpreadsheetTable,
    projectSpreadsheetConditionalStyles,
    resolveSpreadsheetChartDataSet,
    savedSpreadsheetTableView,
    setSpreadsheetTableSort,
    setSpreadsheetTableValueFilter,
    spreadsheetTableDistinctValues,
    spreadsheetDrawingBounds,
    spreadsheetDrawingObjectId,
    readSpreadsheetDrawingObjects,
    type SpreadsheetChartFrame,
    type SpreadsheetCellValue,
    type SpreadsheetCalculationSnapshot,
    type SpreadsheetHyperlink,
    type SpreadsheetDrawingBounds,
    type SpreadsheetTable,
    type SpreadsheetTableViewState,
    type SpreadsheetWorksheet,
  } from "@tumblerjs/sheets";
  import { calculateSpreadsheetViewport, type SpreadsheetViewport } from "./spreadsheet-viewport.ts";
  import { composeSpreadsheetGridLayout, frozenAxisExtent, placeSpreadsheetDrawing, type SpreadsheetGridLayout } from "./spreadsheet-grid-layout.ts";
  import { coerceSpreadsheetEditValue, spreadsheetCellUsesTextFormat, type SpreadsheetGridEdit } from "./spreadsheet-edit.ts";
  import { measureMaximumDigitWidth, spreadsheetFontShorthand } from "./spreadsheet-font-metrics.ts";
  import { spreadsheetCellContentCss, spreadsheetCellCss } from "./spreadsheet-cell-style.ts";
  import { spreadsheetTextOverflowWidth } from "./spreadsheet-text-overflow.ts";
  import { spreadsheetEmptyRegionStart } from "./spreadsheet-empty-region.ts";
  import { zoomGesture, type ZoomGesture } from "./zoom-gesture.ts";
  import { spreadsheetWheelScroll } from "./spreadsheet-wheel.ts";
  import { spreadsheetScrollAxis } from "./spreadsheet-scroll.ts";
  import { spreadsheetSelectionRects, spreadsheetSelectionRanges } from "./spreadsheet-selection.ts";
  import { spreadsheetCellLayer } from "./spreadsheet-cell-layer.ts";
  import SpreadsheetDrawingObject from "./SpreadsheetDrawingObject.svelte";
  import SpreadsheetChart from "./SpreadsheetChart.svelte";
  import SpreadsheetFormulaAutocomplete from "./SpreadsheetFormulaAutocomplete.svelte";

  interface RenderableChart {
    readonly frame: SpreadsheetChartFrame;
    readonly bounds: SpreadsheetDrawingBounds;
    readonly model: ChartModel;
  }

  interface SpreadsheetRemoteSelection {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly range: GridSelection["range"];
  }

  interface Props {
    readonly showGridlines?: boolean;
    readonly showHeadings?: boolean;
    readonly remoteSelections?: readonly SpreadsheetRemoteSelection[];
    /** Referenced ranges to show independently of the active cell and collaborators. */
    readonly highlightRanges?: readonly { readonly range: GridSelection["range"]; readonly color: string }[];
    readonly worksheet: SpreadsheetWorksheet;
    readonly calculation?: SpreadsheetCalculationSnapshot;
    selection?: GridSelection;
    readonly onselectionchange?: (selection: GridSelection) => void;
    readonly onedit?: (edit: SpreadsheetGridEdit) => void;
    readonly onclear?: (selection: GridSelection) => void;
    readonly onhyperlink?: (hyperlink: SpreadsheetHyperlink) => void;
    objectSelection?: number;
    readonly onobjectmove?: (objectId: number, bounds: SpreadsheetDrawingBounds) => void;
    readonly onobjectdelete?: (objectId: number) => void;
    chartSelection?: number;
    readonly onobjectselectionchange?: (objectId: number | undefined) => void;
    readonly onchartselectionchange?: (anchorElementId: number | undefined) => void;
    /** Prevents cell edits while retaining selection and table view controls. */
    readonly readonly?: boolean;
    readonly preserveInputFocus?: boolean;
    readonly scale?: number;
    readonly rowCount?: number;
    readonly columnCount?: number;
    readonly rowHeight?: number;
    readonly columnWidth?: number;
  }

  let {
    showGridlines = true,
    showHeadings = true,
    worksheet,
    remoteSelections = [],
    highlightRanges = [],
    calculation,
    selection = createGridSelection({ row: 1, column: 1 }),
    onselectionchange,
    onedit,
    onclear,
    onhyperlink,
    objectSelection, onobjectmove, onobjectdelete,
    chartSelection,
    onobjectselectionchange,
    onchartselectionchange,
    readonly = false,
    preserveInputFocus = false,
    scale = $bindable(1),
    rowCount = EXCEL_MAX_ROWS,
    columnCount = EXCEL_MAX_COLUMNS,
    rowHeight = 28,
    columnWidth = 112,
  }: Props = $props();

  const gridId = $props.id();
  let scroller = $state<HTMLDivElement>();
  let viewportWidth = $state(800);
  let viewportHeight = $state(500);
  let scrollTop = $state(0);
  let scrollLeft = $state(0);
  let physicalScrollTop = $state(0);
  let physicalScrollLeft = $state(0);
  let editing = $state<string>();
  let editor = $state<HTMLInputElement>();
  let draft = $state("");
  let selectDraft = false;
  let editingText = false;
  let maximumDigitWidth = $state(7);
  let stateWorksheet = $state<SpreadsheetWorksheet>();
  let tableStates = $state<Record<string, SpreadsheetTableViewState>>({});
  let tableMenu = $state<{ key: string; columnId: number; left: number; top: number }>();
  let selectingPointer = $state<number>();
  let pointerSelection: GridSelection | undefined;
  let selectionDragged = $state(false);
  let suppressCellClick = $state(false);
  const directions: Partial<Record<string, GridDirection>> = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  };
  const rowHeaderWidth = $derived(showHeadings ? 52 : 0);
  const columnHeaderHeight = $derived(showHeadings ? 28 : 0);
  // The host snapshot already contains the calculation unless local table views need a projection.
  let viewCalculation = $derived(calculation === undefined || worksheet.tables.length === 0 ? calculation : calculateSpreadsheetWorksheet(worksheet, {
    tableViewStates: tableStates,
  }));
  let tableProjections = $derived(worksheet.tables.map((table) => ({
    table,
    projection: projectSpreadsheetTable(
      worksheet,
      table,
      tableStates[table.partName.value] ?? savedSpreadsheetTableView(table).state,
      viewCalculation === undefined ? undefined : {
        value: (row, column) => viewCalculation.value({ row, column }),
        displayText: (row, column) => viewCalculation.displayText({ row, column }),
      },
    ),
  })));
  let projectedRows = $derived.by(() => {
    const result = new Map<number, number | undefined>();
    for (const { table, projection } of tableProjections) {
      const bodyStart = table.range.start.row + table.headerRowCount;
      const bodyEnd = table.range.end.row - table.totalsRowCount;
      for (let visualRow = bodyStart; visualRow <= bodyEnd; visualRow += 1) {
        result.set(visualRow, projection.rows[visualRow - bodyStart]);
      }
    }
    return result;
  });
  let rowGeometry = $derived(worksheet.rowGeometry(rowCount, projectedRows));
  let columnGeometry = $derived(worksheet.columnGeometry(columnCount, maximumDigitWidth));
  const horizontalScroll = $derived(spreadsheetScrollAxis(columnGeometry.totalSize + rowHeaderWidth, viewportWidth));
  const verticalScroll = $derived(spreadsheetScrollAxis(rowGeometry.totalSize + columnHeaderHeight, viewportHeight));
  let drawingRowGeometry = $derived(worksheet.rowGeometry(rowCount));
  let charts = $derived.by(() => {
    const frames = worksheet.drawing?.charts ?? [];
    const models = resolveSpreadsheetChartDataSet(worksheet, frames.map((frame) => frame.model), { tableViewStates: tableStates });
    return frames.map((frame, index) => ({
      frame,
      bounds: spreadsheetDrawingBounds(frame.anchor, drawingRowGeometry, columnGeometry),
      model: models[index]!,
    }));
  });
  let visibleCharts = $derived(charts.flatMap((chart) => {
    const placement = placeSpreadsheetDrawing({
      anchor: chart.frame.anchor,
      bounds: chart.bounds,
      frozenRows,
      frozenColumns,
      frozenRowsHeight,
      frozenColumnsWidth,
      scrollTop,
      scrollLeft,
      viewportWidth,
      viewportHeight,
      rowHeaderWidth,
      columnHeaderHeight,
    });
    return placement.visible ? [{ ...chart, placement }] : [];
  }));
  let objects = $derived(worksheet.drawing ? readSpreadsheetDrawingObjects(worksheet.workbook, worksheet.drawing, worksheet) : []);
  let visibleObjects = $derived(objects.flatMap(frame => {
    const bounds = spreadsheetDrawingBounds(frame.anchor, drawingRowGeometry, columnGeometry);
    const placement = placeSpreadsheetDrawing({ anchor: frame.anchor, bounds, frozenRows, frozenColumns, frozenRowsHeight, frozenColumnsWidth, scrollTop, scrollLeft, viewportWidth, viewportHeight, rowHeaderWidth, columnHeaderHeight });
    return placement.visible ? [{ ...frame, bounds, placement }] : [];
  }));
  let drawingDrag = $state<{id:number;pointer:number;startX:number;startY:number;bounds:SpreadsheetDrawingBounds;resize:boolean}>();
  let dragOffset=$state({x:0,y:0});
  function drawingTransform(id:number|undefined) {
    const drag=drawingDrag;
    if(!drag || drag.id!==id)return undefined;
    return drag.resize?`scale(${Math.max(1,drag.bounds.width+dragOffset.x)/drag.bounds.width},${Math.max(1,drag.bounds.height+dragOffset.y)/drag.bounds.height})`:`translate(${dragOffset.x}px,${dragOffset.y}px)`;
  }
  function drawingPointerMove(event:PointerEvent){const drag=drawingDrag;if(drag && drag.pointer===event.pointerId)dragOffset={x:(event.clientX-drag.startX)/scale,y:(event.clientY-drag.startY)/scale};}
  function drawingPointerDown(event: PointerEvent, id: number, bounds: SpreadsheetDrawingBounds) {
    event.stopPropagation();
    if(event.button !== 0) return;
    onobjectselectionchange?.(id);
    if(readonly) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    dragOffset={x:0,y:0};
    drawingDrag = {id,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,bounds,resize:event.target instanceof Element && !!event.target.closest('[data-resize]')};
  }
  function drawingPointerUp(event: PointerEvent) {
    const drag = drawingDrag;
    if(!drag || drag.pointer !== event.pointerId) return;
    drawingDrag = undefined;
    const dx=(event.clientX-drag.startX)/scale,dy=(event.clientY-drag.startY)/scale;
    if(Math.abs(dx)+Math.abs(dy)<2) return;
    onobjectmove?.(drag.id,drag.resize?{...drag.bounds,width:Math.max(1,drag.bounds.width+dx),height:Math.max(1,drag.bounds.height+dy)}:{...drag.bounds,x:drag.bounds.x+dx,y:drag.bounds.y+dy});
  }
  let frozenPane = $derived(worksheet.panes.find((pane) => pane.state === "frozen" || pane.state === "frozenSplit"));
  let frozenRows = $derived(Math.min(rowCount, Math.max(0, Math.floor(frozenPane?.ySplit ?? 0))));
  let frozenColumns = $derived(Math.min(columnCount, Math.max(0, Math.floor(frozenPane?.xSplit ?? 0))));
  let frozenRowsHeight = $derived(frozenAxisExtent(rowGeometry, frozenRows));
  let frozenColumnsWidth = $derived(frozenAxisExtent(columnGeometry, frozenColumns));

  let previousViewport: SpreadsheetViewport | undefined;
  let renderedRows = $state.raw<SpreadsheetGridLayout["rows"]>([]);
  let renderedColumns = $state.raw<SpreadsheetGridLayout["columns"]>([]);
  let renderedMerges = $state.raw<SpreadsheetGridLayout["merges"]>([]);
  $effect.pre(() => {
    const viewport = calculateSpreadsheetViewport({
      rowCount, columnCount, rowHeight, columnWidth,
      scrollTop: Math.max(0, scrollTop - columnHeaderHeight), scrollLeft: Math.max(0, scrollLeft - rowHeaderWidth),
      viewportHeight, viewportWidth,
      overscan: Math.max(3, Math.ceil(4 / scale)), rowGeometry, columnGeometry,
    }, previousViewport);
    previousViewport = viewport;
    const layout = composeSpreadsheetGridLayout({ viewport, rowGeometry, columnGeometry, frozenRows, frozenColumns, merges: worksheet.merges });
    renderedRows = layout.rows;
    renderedColumns = layout.columns;
    renderedMerges = layout.merges;
  });
  // Keep child coordinates within browser layout limits even near Excel's last row.
  let rowOrigin = $state(0);
  let columnOrigin = $state(0);
  $effect.pre(() => {
    rowOrigin = Math.floor(scrollTop / 65_536) * 65_536;
    columnOrigin = Math.floor(scrollLeft / 65_536) * 65_536;
  });
  const selectionRects = $derived(spreadsheetSelectionRanges(selection.range,projectedRows).flatMap(range=>spreadsheetSelectionRects({rowHeaderWidth,columnHeaderHeight,range,rows:rowGeometry,columns:columnGeometry,scrollTop,scrollLeft,width:viewportWidth,height:viewportHeight,frozenRows,frozenColumns})));
  const remoteRects = $derived(remoteSelections.map(peer => ({ ...peer, rects: spreadsheetSelectionRanges(peer.range,projectedRows).flatMap(range=>spreadsheetSelectionRects({rowHeaderWidth,columnHeaderHeight,range,rows:rowGeometry,columns:columnGeometry,scrollTop,scrollLeft,width:viewportWidth,height:viewportHeight,frozenRows,frozenColumns})) })));
  const highlightRects = $derived(highlightRanges.map(peer => ({ ...peer, rects: spreadsheetSelectionRanges(peer.range,projectedRows).flatMap(range=>spreadsheetSelectionRects({rowHeaderWidth,columnHeaderHeight,range,rows:rowGeometry,columns:columnGeometry,scrollTop,scrollLeft,width:viewportWidth,height:viewportHeight,frozenRows,frozenColumns})) })));
  let maximumVisibleColumn = $derived(renderedColumns.at(-1)?.index ?? 1);
  let emptyRegionStart = $derived(spreadsheetEmptyRegionStart(worksheet));
  let emptyCorner = $derived.by(() => {
    if (emptyRegionStart === undefined) return undefined;
    const rows = renderedRows.filter(row => row.index > Math.max(emptyRegionStart.row, frozenRows));
    const columns = renderedColumns.filter(column => column.index > Math.max(emptyRegionStart.column, frozenColumns));
    if (rows.length === 0 || columns.length === 0) return undefined;
    const left = columns[0]!.start;
    const top = rows[0]!.start;
    const width = columns.at(-1)!.start + columns.at(-1)!.size - left;
    const height = rows.at(-1)!.start + rows.at(-1)!.size - top;
    const lines = [
      ...columns.map(column => `M${column.start + column.size - left - 0.5},0v${height}`),
      ...rows.map(row => `M0,${row.start + row.size - top - 0.5}h${width}`),
    ].join('');
    return { left, top, width, height, lines };
  });

  function isEmptyCorner(row: number, column: number) {
    return emptyRegionStart !== undefined && row > Math.max(emptyRegionStart.row, frozenRows) && column > Math.max(emptyRegionStart.column, frozenColumns);
  }

  const denseGrid = $derived(renderedRows.length * renderedColumns.length > 1500);
  const verticalText = $derived(worksheet.styles.cellFormats.some(style => style.alignment.textRotation === 255));
  let specialCells = $derived.by(() => {
    if (!denseGrid && !editing) return [];
    const cells = new Map<string, { row: (typeof renderedRows)[number]; column: (typeof renderedColumns)[number]; sourceRow: number; reference: string }>();
    const add = (address: { row: number; column: number }) => {
      const row = renderedRows.find(row => sourceRow(row.index) === address.row);
      const column = renderedColumns.find(column => column.index === address.column);
      if (!row || !column || row.index <= frozenRows || column.index <= frozenColumns || isEmptyCorner(row.index, column.index)) return;
      const reference = formatCellReference(address);
      if (worksheet.mergedRange(reference) === undefined) cells.set(reference, { row, column, sourceRow: address.row, reference });
    };
    if (denseGrid) { add(selection.focus); add(selection.anchor); }
    if (editing) add(parseCellReference(editing));
    if (denseGrid && (worksheet.hyperlinks.length || worksheet.tables.length || verticalText)) {
      for (const row of renderedRows) {
        const source = sourceRow(row.index);
        if (source === undefined) continue;
        for (const column of renderedColumns) {
          const address = { row: source, column: column.index };
          if (worksheet.hyperlink(address) !== undefined || tableHeader(source, column.index) !== undefined || worksheet.cellStyle(address).alignment.textRotation === 255) add(address);
        }
      }
    }
    return [...cells.values()];
  });
  const activeOwner = $derived(worksheet.mergedRange(selection.focus)?.start ?? selection.focus);
  const activeReference = $derived(formatCellReference(activeOwner));
  const activeCellId = $derived(denseGrid && (
    specialCells.some(cell => cell.reference === activeReference) ||
    renderedMerges.some(merge => formatCellReference(merge.range.start) === activeReference) ||
    (renderedRows.some(row => sourceRow(row.index) === activeOwner.row) && renderedColumns.some(column => column.index === activeOwner.column) &&
      (activeOwner.row <= frozenRows || activeOwner.column <= frozenColumns || isEmptyCorner(activeOwner.row, activeOwner.column)))
  ) ? `${gridId}-${activeReference}` : undefined);

  function bodyCell(event: MouseEvent) {
    const cell = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-reference]') : null;
    if (cell?.dataset.reference) return parseCellReference(cell.dataset.reference);
    if (!scroller) return undefined;
    const rect = scroller.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale + scrollLeft - rowHeaderWidth;
    const y = (event.clientY - rect.top) / scale + scrollTop - columnHeaderHeight;
    if (x < 0 || y < 0) return undefined;
    const visual = rowGeometry.indexAt(y);
    const column = columnGeometry.indexAt(x);
    if (isEmptyCorner(visual, column)) return undefined;
    const row = sourceRow(visual);
    return row === undefined ? undefined : { row, column };
  }

  function emptyCellAt(event: MouseEvent) {
    if (scroller === undefined || !(event.target instanceof Element) || event.target.closest('.cell, .chart-frame')) return undefined;
    const rect = scroller.getBoundingClientRect();
    const x = (event.clientX - rect.left) / scale + scrollLeft - rowHeaderWidth;
    const y = (event.clientY - rect.top) / scale + scrollTop - columnHeaderHeight;
    if (x < 0 || y < 0) return undefined;
    const row = rowGeometry.indexAt(y);
    const column = columnGeometry.indexAt(x);
    return isEmptyCorner(row, column) ? { row, column } : undefined;
  }

  function emptyPointerDown(event: PointerEvent) {
    const cell = emptyCellAt(event);
    if (cell === undefined) return;
    cellPointerDown(event, cell.row, cell.column);
  }

  function emptyPointerMove(event: PointerEvent) {
    if (selectingPointer === undefined) return;
    const cell = emptyCellAt(event);
    if (cell !== undefined) cellPointerEnter(event, cell.row, cell.column);
  }

  let hasActiveProjection = $derived(tableProjections.some(({ projection }) => projection.state.filters.length > 0 || projection.state.sorts.length > 0));
  let editable = $derived(!readonly && !hasActiveProjection && onedit !== undefined);
  let conditionalStyles = $derived(projectSpreadsheetConditionalStyles(worksheet, viewCalculation));

  $effect(() => {
    const current = worksheet;
    if (stateWorksheet === current) return;
    stateWorksheet = current;
    tableStates = Object.fromEntries(current.tables.map((table) => [table.partName.value, savedSpreadsheetTableView(table).state]));
    tableMenu = undefined;
  });

  $effect(() => {
    const reference = editing;
    if (reference === undefined) return;
    void tick().then(() => {
      if (editing !== reference) return;
      editor?.focus();
      if (selectDraft) editor?.select();
      else editor?.setSelectionRange(draft.length, draft.length);
    });
  });

  $effect(() => {
    const styles = worksheet.styles;
    const font = styles.resolve(0).font;
    const name = styles.resolveFontName(font);
    if (typeof document === "undefined") {
      maximumDigitWidth = 7;
      return;
    }
    let current = true;
    const shorthand = spreadsheetFontShorthand({ ...font, size: styles.resolveFontSize(font) }, name);
    const refresh = () => {
      const context = document.createElement("canvas").getContext("2d");
      if (context === null || !current) return;
      context.font = shorthand;
      maximumDigitWidth = measureMaximumDigitWidth((digit) => context.measureText(digit).width);
    };
    refresh();
    void document.fonts?.load(shorthand).then(refresh);
    return () => { current = false; };
  });

  function select(row: number, column: number, extend = false, reveal = true) {
    if (chartSelection !== undefined) {
      chartSelection = undefined;
      onchartselectionchange?.(undefined);
    }
    const point = { row, column };
    const merge = worksheet.mergedRange(point);
    selection = extend
      ? createGridSelection(selection.anchor, merge?.end ?? point)
      : merge === undefined
        ? createGridSelection(point)
        : createGridSelection(merge.start, merge.end);
    pointerSelection = reveal ? undefined : selection;
    if (pointerSelection) {
      const pointer = pointerSelection;
      void tick().then(() => { if (pointerSelection === pointer) pointerSelection = undefined; });
    }
    onselectionchange?.(selection);
  }

  function selectHeader(index: number, row: boolean, extend: boolean) {
    const anchor = extend ? (row ? selection.anchor.row : selection.anchor.column) : index;
    selection = row
      ? { ...createGridSelection({ row: anchor, column: 1 }, { row: index, column: columnCount }), focus: { row: index, column: selection.focus.column } }
      : { ...createGridSelection({ row: 1, column: anchor }, { row: rowCount, column: index }), focus: { row: selection.focus.row, column: index } };
    onselectionchange?.(selection);
  }

  async function zoomGrid(gesture: ZoomGesture) {
    if (scroller === undefined) return;
    selectingPointer = undefined;
    const rect = scroller.getBoundingClientRect();
    const x = (gesture.x - rect.left) / scale;
    const y = (gesture.y - rect.top) / scale;
    const documentX = scrollLeft + x;
    const documentY = scrollTop + y;
    scale = Math.max(0.25, Math.min(3, scale * gesture.factor));
    await tick();
    if (scroller === undefined) return;
    // Frozen panes stay fixed; only anchor the scrolling portion of each axis.
    if (x > rowHeaderWidth + frozenColumnsWidth) setScroll(documentX - (gesture.targetX - rect.left) / scale, scrollTop);
    if (y > columnHeaderHeight + frozenRowsHeight) setScroll(scrollLeft, documentY - (gesture.targetY - rect.top) / scale);

  }

  // Keyboard navigation and host-driven selection keep the focused cell in view.
  $effect(() => {
    const element = scroller;
    const focus = editing ? parseCellReference(editing) : selection.focus;
    if (!editing && pointerSelection && selection.focus.row === pointerSelection.focus.row && selection.focus.column === pointerSelection.focus.column && selection.anchor.row === pointerSelection.anchor.row && selection.anchor.column === pointerSelection.anchor.column) return;
    if (element === undefined) return;
    const row = visualRow(focus.row);
    const x = columnGeometry.start(focus.column) + rowHeaderWidth;
    const y = rowGeometry.start(row) + columnHeaderHeight;
    const right = x + columnGeometry.size(focus.column);
    const bottom = y + rowGeometry.size(row);
    const width = viewportWidth, height = viewportHeight;
    const frozenWidth = frozenColumnsWidth, frozenHeight = frozenRowsHeight;
    const fixedColumns = frozenColumns, fixedRows = frozenRows;
    untrack(() => {
    if (focus.column > fixedColumns) {
      if (x < scrollLeft + rowHeaderWidth + frozenWidth) setScroll(x - rowHeaderWidth - frozenWidth, scrollTop);
      else if (right > scrollLeft + width) setScroll(right - width, scrollTop);
    }
    if (row > fixedRows) {
      if (y < scrollTop + columnHeaderHeight + frozenHeight) setScroll(scrollLeft, y - columnHeaderHeight - frozenHeight);
      else if (bottom > scrollTop + height) setScroll(scrollLeft, bottom - height);
    }
    });
  });

  function handleScroll(event: Event) {
    const target = event.currentTarget as HTMLDivElement;
    physicalScrollTop = target.scrollTop;
    physicalScrollLeft = target.scrollLeft;
    if (Math.abs(target.scrollTop - verticalScroll.physical(scrollTop)) > 1) scrollTop = verticalScroll.logical(target.scrollTop);
    if (Math.abs(target.scrollLeft - horizontalScroll.physical(scrollLeft)) > 1) scrollLeft = horizontalScroll.logical(target.scrollLeft);
  }


  let wheelScroll: ReturnType<typeof spreadsheetWheelScroll> | undefined;
  onMount(() => {
    wheelScroll = spreadsheetWheelScroll((x, y) => setScroll(scrollLeft + x, scrollTop + y));
    return () => { wheelScroll?.cancel(); wheelScroll = undefined; };
  });

  function setScroll(left: number, top: number) {
    wheelScroll?.cancel();
    if (!scroller) return;
    scrollLeft = horizontalScroll.logical(horizontalScroll.physical(left));
    scrollTop = verticalScroll.logical(verticalScroll.physical(top));
    scroller.scrollLeft = horizontalScroll.physical(scrollLeft);
    scroller.scrollTop = verticalScroll.physical(scrollTop);
    physicalScrollLeft = scroller.scrollLeft;
    physicalScrollTop = scroller.scrollTop;
  }

  function handleWheel(event: WheelEvent) {
    if (event.ctrlKey || event.metaKey || (!horizontalScroll.compressed && !verticalScroll.compressed)) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? rowHeight : event.deltaMode === 2 ? viewportHeight : 1;
    wheelScroll?.add((event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * unit / scale,
      (event.shiftKey && !event.deltaX ? 0 : event.deltaY) * unit / scale);
  }

  function cellPointerDown(event: PointerEvent, row: number, column: number) {
    if (event.pointerType !== "mouse" || event.button !== 0 || interactivePointerTarget(event)) return;
    event.preventDefault();
    if (!preserveInputFocus) scroller?.closest<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true });
    selectingPointer = event.pointerId;
    selectionDragged = false;
    select(row, column, event.shiftKey, false);
  }

  function cellPointerEnter(event: PointerEvent, row: number, column: number) {
    if (selectingPointer !== event.pointerId || (event.buttons & 1) === 0 || selection.focus.row === row && selection.focus.column === column) return;
    event.preventDefault();
    selectionDragged = true;
    select(row, column, true);
  }

  function finishPointerSelection(event: PointerEvent) {
    if (selectingPointer !== event.pointerId) return;
    selectingPointer = undefined;
    if (!selectionDragged) return;
    suppressCellClick = true;
    setTimeout(() => { suppressCellClick = false; }, 0);
  }

  function cellClick(event: MouseEvent, row: number, column: number) {
    if (suppressCellClick) return;
    select(row, column, event.shiftKey, false);
  }

  function interactivePointerTarget(event: PointerEvent): boolean {
    return event.target instanceof Element && event.target.closest("button, input") !== null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if(event.isComposing || event.target instanceof HTMLElement && !!event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if(objectSelection!==undefined && !readonly && (event.key==='Delete'||event.key==='Backspace')) {event.preventDefault();onobjectdelete?.(objectSelection);return;}

    if (event.isComposing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    if (event.key === "Tab") {
      event.preventDefault();
      selection = moveGridSelection(selection, event.shiftKey ? "left" : "right", { rows: rowCount, columns: columnCount });
      onselectionchange?.(selection);
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const direction = directions[event.key];
    if (direction !== undefined) {
      event.preventDefault();
      if ((direction === "up" || direction === "down") && projectedRows.size > 0) moveProjectedSelection(direction, event.shiftKey);
      else {
        selection = moveGridSelection(selection, direction, { rows: rowCount, columns: columnCount }, { extend: event.shiftKey });
        onselectionchange?.(selection);
      }
    } else if (event.key === "Enter" || event.key === "F2") {
      if (editable) {
        event.preventDefault();
        beginEdit(selection.anchor.row, selection.anchor.column);
      }
    } else if (event.key === "Backspace") {
      if (editable) {
        event.preventDefault();
        beginEdit(selection.anchor.row, selection.anchor.column, "");
      }
    } else if (event.key === "Delete") {
      if (editable) {
        event.preventDefault();
        if (onclear !== undefined) onclear(selection);
        else {
          const owner = worksheet.mergedRange(selection.focus)?.start ?? selection.focus;
          onedit?.({ reference: formatCellReference(owner), value: null });
        }
      }
    } else if (editable && event.key.length === 1) {
      event.preventDefault();
      beginEdit(selection.anchor.row, selection.anchor.column, event.key);
    }
  }

  function beginEdit(row: number, column: number, initial?: string) {
    if (!editable) return;
    const owner = worksheet.mergedRange({ row, column })?.start ?? { row, column };
    const reference = formatCellReference(owner);
    selectDraft = initial === undefined;
    editingText = initial === undefined;
    editing = reference;
    const cell = worksheet.cell(reference);
    draft = initial ?? (cell?.formula === undefined ? displayValue(cell?.value) : `=${cell.formula}`);
  }

  function cellKeydown(event: KeyboardEvent, row: number, column: number) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(row, column, event.shiftKey, false);
    }
  }

  function finishEdit(commit: boolean) {
    const reference = editing;
    editing = undefined;
    if (commit && reference !== undefined) {
      const asText = spreadsheetCellUsesTextFormat(worksheet, reference);
      onedit?.({ reference, value: coerceSpreadsheetEditValue(draft, worksheet.cell(reference)?.value, asText), ...(asText ? { kind: "value" as const } : {}) });
    }
  }

  function inputKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.isComposing) return;
    if (event.key === "F2") {
      event.preventDefault();
      editingText = true;
      return;
    }
    const arrow = directions[event.key];
    if (arrow !== undefined && editingText) {
      // Single-line inputs have no vertical caret movement; never scroll the sheet while editing text.
      if (arrow === "up" || arrow === "down") event.preventDefault();
      return;
    }
    if (event.key === "Enter" || event.key === "Tab" || arrow !== undefined) {
      event.preventDefault();
      const origin = editing;
      finishEdit(true);
      if (origin !== undefined) selection = createGridSelection(parseCellReference(origin));
      selection = moveGridSelection(selection, arrow ?? (event.key === "Tab" ? (event.shiftKey ? "left" : "right") : (event.shiftKey ? "up" : "down")), { rows: rowCount, columns: columnCount });
      onselectionchange?.(selection);
      void tick().then(() => scroller?.closest<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true }));
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishEdit(false);
      void tick().then(() => scroller?.closest<HTMLElement>('[role="grid"]')?.focus({ preventScroll: true }));
    }
  }

  function selected(row: number, column: number): boolean {
    return row >= selection.range.start.row && row <= selection.range.end.row &&
      column >= selection.range.start.column && column <= selection.range.end.column;
  }

  function displayValue(value: SpreadsheetCellValue | undefined): string {
    if (value === undefined || value.type === "blank") return "";
    if (value.type === "boolean") return value.value ? "TRUE" : "FALSE";
    return String(value.value);
  }

  function displayCell(reference: string): string {
    return viewCalculation?.displayText(reference) ?? worksheet.displayText(reference);
  }

  function textOverflowWidth(row: number, column: number): number | undefined {
    const maximumColumn = Math.max(maximumVisibleColumn, column);
    return spreadsheetTextOverflowWidth({
      worksheet,
      calculation: viewCalculation,
      row,
      column,
      columnGeometry,
      maximumColumn,
      frozenColumns,
    });
  }

  function activateHyperlink(event: MouseEvent, hyperlink: SpreadsheetHyperlink, row: number, column: number) {
    event.stopPropagation();
    select(row, column);
    onhyperlink?.(hyperlink);
  }

  function selectChart(event: MouseEvent, frame: SpreadsheetChartFrame) {
    event.stopPropagation();
    chartSelection = frame.anchor.elementId;
    onchartselectionchange?.(chartSelection);
  }

  function columnLabel(column: number): string {
    return formatCellReference({ row: 1, column }).slice(0, -1);
  }

  function sourceRow(visualRow: number): number | undefined {
    return projectedRows.has(visualRow) ? projectedRows.get(visualRow) : visualRow;
  }

  function visualRow(source: number): number {
    for (const [visual, projected] of projectedRows) if (projected === source) return visual;
    return source;
  }

  function moveProjectedSelection(direction: "up" | "down", extend: boolean) {
    const step = direction === "up" ? -1 : 1;
    let targetVisual = visualRow(selection.focus.row) + step;
    while (targetVisual >= 1 && targetVisual <= rowCount) {
      const targetSource = sourceRow(targetVisual);
      if (targetSource !== undefined) {
        const point = { row: targetSource, column: selection.focus.column };
        selection = extend ? createGridSelection(selection.anchor, point) : createGridSelection(point);
        onselectionchange?.(selection);
        return;
      }
      targetVisual += step;
    }
  }

  function tableHeader(row: number, column: number): { table: SpreadsheetTable; columnId: number } | undefined {
    const table = worksheet.tables.find((candidate) => candidate.headerRowCount === 1 && row === candidate.range.start.row &&
      column >= candidate.range.start.column && column <= candidate.range.end.column);
    return table === undefined ? undefined : { table, columnId: column - table.range.start.column };
  }

  function openTableMenu(event: MouseEvent, table: SpreadsheetTable, columnId: number) {
    event.stopPropagation();
    const bounds = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
    tableMenu = { key: table.partName.value, columnId, left: bounds.right - 220, top: bounds.bottom + 4 };
  }

  function menuTable(): SpreadsheetTable | undefined {
    return worksheet.tables.find((table) => table.partName.value === tableMenu?.key);
  }

  function menuState(table: SpreadsheetTable): SpreadsheetTableViewState {
    return tableStates[table.partName.value] ?? savedSpreadsheetTableView(table).state;
  }

  function updateTableState(table: SpreadsheetTable, state: SpreadsheetTableViewState) {
    tableStates = { ...tableStates, [table.partName.value]: state };
    editing = undefined;
    const projection = projectSpreadsheetTable(worksheet, table, state, viewCalculation === undefined ? undefined : {
      value: (row, column) => viewCalculation.value({ row, column }),
      displayText: (row, column) => viewCalculation.displayText({ row, column }),
    });
    const bodyStart = table.range.start.row + table.headerRowCount;
    const bodyEnd = table.range.end.row - table.totalsRowCount;
    if (selection.focus.row >= bodyStart && selection.focus.row <= bodyEnd && !projection.rows.includes(selection.focus.row)) {
      const row = projection.rows[0] ?? table.range.start.row;
      select(row, selection.focus.column);
    }
  }

  function tableButtonVisible(table: SpreadsheetTable, columnId: number): boolean {
    const column = table.autoFilter?.columns.find((candidate) => candidate.columnId === columnId);
    return column?.hiddenButton !== true && column?.showButton !== false;
  }

  function sortTable(table: SpreadsheetTable, columnId: number, direction: "ascending" | "descending") {
    updateTableState(table, setSpreadsheetTableSort(menuState(table), columnId, direction));
    tableMenu = undefined;
  }

  function clearTableFilter(table: SpreadsheetTable, columnId: number) {
    updateTableState(table, clearSpreadsheetTableFilter(menuState(table), columnId));
  }

  function valueChecked(table: SpreadsheetTable, columnId: number, value: string): boolean {
    const criteria = menuState(table).filters.find((filter) => filter.columnId === columnId)?.criteria;
    if (criteria?.kind !== "values") return true;
    return value === "" ? criteria.includeBlank : criteria.values.includes(value);
  }

  function toggleTableValue(table: SpreadsheetTable, columnId: number, value: string, checked: boolean) {
    const distinct = tableDistinctValues(table, columnId);
    const values = distinct.filter((candidate) => candidate !== "" && (candidate === value ? checked : valueChecked(table, columnId, candidate)));
    const includeBlank = distinct.includes("") && (value === "" ? checked : valueChecked(table, columnId, ""));
    updateTableState(table, setSpreadsheetTableValueFilter(menuState(table), columnId, values, includeBlank));
  }

  function tableDistinctValues(table: SpreadsheetTable, columnId: number): readonly string[] {
    return spreadsheetTableDistinctValues(worksheet, table, columnId, viewCalculation === undefined ? undefined : {
      value: (row, column) => viewCalculation.value({ row, column }),
      displayText: (row, column) => viewCalculation.displayText({ row, column }),
    });
  }

</script>

<svelte:window onpointermove={drawingPointerMove} onpointerup={event=>{finishPointerSelection(event);drawingPointerUp(event);}} onpointercancel={event=>{finishPointerSelection(event);drawingDrag=undefined;dragOffset={x:0,y:0};}} />

{#snippet gridCell(reference: string, sourceRow: number, column: number, left: number, top: number, width: number, height: number, zIndex: number)}
  {@const header = tableHeader(sourceRow, column)}
  {@const hyperlink = worksheet.hyperlink({ row: sourceRow, column })}
  {@const overflowWidth = editing === reference ? undefined : textOverflowWidth(sourceRow, column)}
  {@const conditionalFormats = conditionalStyles.formats(reference)}
  <div
    class:selected={selected(sourceRow, column)}
    class:focused={selection.focus.row === sourceRow && selection.focus.column === column}
    class:active={selection.anchor.row === sourceRow && selection.anchor.column === column}
    class:table-header={header !== undefined}
    class:text-overflow={overflowWidth !== undefined}
    class="cell"
    id={`${gridId}-${reference}`}
    role="gridcell"
    data-reference={reference}
    aria-rowindex={sourceRow}
    aria-colindex={column}
    tabindex="-1"
    aria-selected={selected(sourceRow, column)}
    style:left={`${zIndex === 1 ? left - columnOrigin : left}px`}
    style:top={`${zIndex === 1 ? top - rowOrigin : top}px`}
    style:width={`${width}px`}
    style:height={`${height}px`}
    style:z-index={overflowWidth === undefined ? zIndex : zIndex + 1}
    style={spreadsheetCellCss(worksheet, reference, conditionalFormats, viewCalculation?.value(reference))}
    onpointerdown={(event) => cellPointerDown(event, sourceRow, column)}
    onpointerenter={(event) => cellPointerEnter(event, sourceRow, column)}
    onclick={(event) => cellClick(event, sourceRow, column)}
    onkeydown={(event) => cellKeydown(event, sourceRow, column)}
    ondblclick={() => beginEdit(sourceRow, column)}
  >
    {#if editing === reference}
      <input
        bind:this={editor}
        bind:value={draft}
        autocomplete="off"
        onpointerdown={() => { editingText = true; }}
        onkeydown={inputKeydown}
        onblur={() => finishEdit(true)}
        aria-label={`Edit ${reference}`}
      />
    {:else}
      {#if hyperlink === undefined}
        <span
          class:overflow-content={overflowWidth !== undefined}
          style={spreadsheetCellContentCss(worksheet, reference)}
          style:width={overflowWidth === undefined ? undefined : `${Math.max(0, overflowWidth - 16)}px`}
        >{displayCell(reference)}</span>
      {:else}
        <button
          class="cell-hyperlink"
          type="button"
          title={hyperlink.tooltip}
          style={spreadsheetCellContentCss(worksheet, reference)}
          onclick={(event) => activateHyperlink(event, hyperlink, sourceRow, column)}
        >{hyperlink.display ?? displayCell(reference)}</button>
      {/if}
      {#if header !== undefined && tableButtonVisible(header.table, header.columnId)}
        <button
          class="table-menu-button"
          class:active={menuState(header.table).filters.some((filter) => filter.columnId === header.columnId) || menuState(header.table).sorts.some((sort) => sort.columnId === header.columnId)}
          type="button"
          aria-label={`Sort or filter ${header.table.columns[header.columnId]?.name ?? reference}`}
          aria-haspopup="menu"
          aria-expanded={tableMenu?.key === header.table.partName.value && tableMenu.columnId === header.columnId}
          onclick={(event) => openTableMenu(event, header.table, header.columnId)}
        >⌄</button>
      {/if}
    {/if}
  </div>
{/snippet}

{#snippet chartFrame(chart: RenderableChart, left: number, top: number)}
  <button
    class="chart-frame"
    style:transform-origin="top left" style:transform={drawingTransform(worksheet.drawing?spreadsheetDrawingObjectId(worksheet.drawing,chart.frame.anchor):undefined)}
    onpointerdown={event=>{if(worksheet.drawing){const id=spreadsheetDrawingObjectId(worksheet.drawing,chart.frame.anchor);if(id!==undefined)drawingPointerDown(event,id,chart.bounds);}}}
    data-drawing-id={worksheet.drawing ? spreadsheetDrawingObjectId(worksheet.drawing,chart.frame.anchor) : undefined}
    style:z-index={3 + (worksheet.drawing?.anchors.findIndex(anchor => anchor.elementId === chart.frame.anchor.elementId) ?? 0)}
    class:selected={chartSelection === chart.frame.anchor.elementId}
    type="button"
    aria-label={`Select ${chart.model.title ?? "chart"}`}
    style:left={`${left}px`}
    style:top={`${top}px`}
    style:width={`${Math.max(1, chart.bounds.width)}px`}
    style:height={`${Math.max(1, chart.bounds.height)}px`}
    onclick={(event) => {
      selectChart(event, chart.frame);
      if(worksheet.drawing) onobjectselectionchange?.(spreadsheetDrawingObjectId(worksheet.drawing,chart.frame.anchor));
    }}
  >
    {#if !readonly && worksheet.drawing && objectSelection===spreadsheetDrawingObjectId(worksheet.drawing,chart.frame.anchor)}<span class="drawing-resize" data-resize></span>{/if}
    <SpreadsheetChart
      {worksheet}
      model={chart.model}
      width={Math.max(1, chart.bounds.width)}
      height={Math.max(1, chart.bounds.height)}
      clipId={`tumbler-scatter-clip-${chart.frame.anchor.elementId}`}
    />
  </button>
{/snippet}

<div class="grid-viewport" use:zoomGesture={zoomGrid}>
<div
  class="tumbler-grid"
  style={`transform:scale(${scale});width:${100 / scale}%;height:${100 / scale}%;--tumbler-header-width:${rowHeaderWidth}px;--tumbler-header-height:${columnHeaderHeight}px`}
  class:no-gridlines={!showGridlines}
  class:no-headings={!showHeadings}
  role="grid"
  aria-activedescendant={activeCellId}
  aria-rowcount={rowCount}
  aria-colcount={columnCount}
  tabindex="0"
  oncontextmenu={(event) => {
    if (!(event.target instanceof Element) || !event.target.closest('.canvas') || event.target.closest('.chart-frame')) return;
    const cell = event.target.closest('.body-cells') ? bodyCell(event) : emptyCellAt(event);
    if (cell && (cell.row < selection.range.start.row || cell.row > selection.range.end.row || cell.column < selection.range.start.column || cell.column > selection.range.end.column)) {
      selection = createGridSelection(cell);
      onselectionchange?.(selection);
    }
  }}
  onkeydown={handleKeydown}
>
  <div
    class="grid-scroller"
    bind:this={scroller}
    bind:clientWidth={viewportWidth}
    bind:clientHeight={viewportHeight}
    onscroll={handleScroll}
    onwheel={handleWheel}
  >
    <!-- Blank cells use the grid's keyboard handler and coordinate-based pointer selection. -->
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="canvas" style:width={`${horizontalScroll.extent}px`} style:height={`${verticalScroll.extent}px`}
      onpointerdown={emptyPointerDown} onpointermove={emptyPointerMove}
      onclick={(event) => { const cell = emptyCellAt(event); if (cell !== undefined) cellClick(event, cell.row, cell.column); }}
      ondblclick={(event) => { const cell = emptyCellAt(event); if (cell !== undefined) beginEdit(cell.row, cell.column); }}
    >
      <div class="scrolling-cells" style:transform={`translate(${physicalScrollLeft - scrollLeft + columnOrigin}px,${physicalScrollTop - scrollTop + rowOrigin}px)`}>
      {#if emptyCorner !== undefined}
        <svg class="empty-grid" aria-hidden="true" width={emptyCorner.width} height={emptyCorner.height} style:left={`${rowHeaderWidth + emptyCorner.left - columnOrigin}px`} style:top={`${columnHeaderHeight + emptyCorner.top - rowOrigin}px`}>
          <path d={emptyCorner.lines} />
        </svg>
        {@const startRow = Math.max(selection.range.start.row, emptyRegionStart!.row + 1, frozenRows + 1, renderedRows[0]?.index ?? 1)}
        {@const startColumn = Math.max(selection.range.start.column, emptyRegionStart!.column + 1, frozenColumns + 1, renderedColumns[0]?.index ?? 1)}
        {@const endRow = Math.min(selection.range.end.row, renderedRows.at(-1)?.index ?? startRow)}
        {@const endColumn = Math.min(selection.range.end.column, renderedColumns.at(-1)?.index ?? startColumn)}
        {#if startRow <= endRow && startColumn <= endColumn}
          <div class="empty-selection" style:left={`${rowHeaderWidth + columnGeometry.start(startColumn) - columnOrigin}px`} style:top={`${columnHeaderHeight + rowGeometry.start(startRow) - rowOrigin}px`}
            style:width={`${columnGeometry.start(endColumn) + columnGeometry.size(endColumn) - columnGeometry.start(startColumn)}px`}
            style:height={`${rowGeometry.start(endRow) + rowGeometry.size(endRow) - rowGeometry.start(startRow)}px`}></div>
        {/if}
        {#if isEmptyCorner(selection.focus.row, selection.focus.column) && selection.focus.row >= (renderedRows[0]?.index ?? 1) && selection.focus.row <= (renderedRows.at(-1)?.index ?? 0) && selection.focus.column >= (renderedColumns[0]?.index ?? 1) && selection.focus.column <= (renderedColumns.at(-1)?.index ?? 0)}
          {@const focus = selection.focus}
          <div class="empty-corner-cell" class:empty-focus={editing === undefined}>
            {@render gridCell(formatCellReference(focus), focus.row, focus.column, rowHeaderWidth + columnGeometry.start(focus.column), columnHeaderHeight + rowGeometry.start(focus.row), columnGeometry.size(focus.column), rowGeometry.size(focus.row), 1)}
          </div>
        {/if}
      {/if}
      {#if isEmptyCorner(selection.anchor.row,selection.anchor.column) && (selection.anchor.row !== selection.focus.row || selection.anchor.column !== selection.focus.column) && selection.anchor.row >= (renderedRows[0]?.index ?? 1) && selection.anchor.row <= (renderedRows.at(-1)?.index ?? 0) && selection.anchor.column >= (renderedColumns[0]?.index ?? 1) && selection.anchor.column <= (renderedColumns.at(-1)?.index ?? 0)}
        {@const anchor=selection.anchor}
        {@render gridCell(formatCellReference(anchor),anchor.row,anchor.column,rowHeaderWidth+columnGeometry.start(anchor.column),columnHeaderHeight+rowGeometry.start(anchor.row),columnGeometry.size(anchor.column),rowGeometry.size(anchor.row),1)}
      {/if}
      {#if denseGrid}
      <!-- Ordinary cells use delegated interaction and no per-cell reactive subscriptions. -->
      <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
      <div class="body-cells"
        use:spreadsheetCellLayer={{ scrollTop, scrollLeft, viewportWidth, viewportHeight, scale, gridlines: showGridlines, worksheet, calculation: viewCalculation, conditional: conditionalStyles,
          rows: renderedRows, columns: renderedColumns, columnGeometry, projectedRows, selection, editing,
          frozenRows, frozenColumns, rowOrigin, columnOrigin, rowHeaderWidth, columnHeaderHeight, emptyRegion: emptyRegionStart }}
        onpointerdown={event => { const cell = bodyCell(event); if (cell) cellPointerDown(event, cell.row, cell.column); }}
        onpointermove={event => { const cell = bodyCell(event); if (cell) cellPointerEnter(event, cell.row, cell.column); }}
        onclick={event => { const cell = bodyCell(event); if (cell) cellClick(event, cell.row, cell.column); }}
        ondblclick={event => { const cell = bodyCell(event); if (cell) beginEdit(cell.row, cell.column); }}

      ></div>
      {:else}
      {#each renderedRows as row (row.index)}
        {#each renderedColumns as column (column.index)}
          {@const projectedRow = sourceRow(row.index)}
          {@const reference = formatCellReference({ row: projectedRow ?? row.index, column: column.index })}
          {#if row.index > frozenRows && column.index > frozenColumns && projectedRow !== undefined && !isEmptyCorner(row.index, column.index) && reference !== editing && worksheet.mergedRange(reference) === undefined}
            {@render gridCell(reference, projectedRow, column.index, rowHeaderWidth + column.start, columnHeaderHeight + row.start, column.size, row.size, 1)}
          {/if}
        {/each}
      {/each}
      {/if}
      {#each specialCells as cell (cell.reference)}
        {@render gridCell(cell.reference, cell.sourceRow, cell.column.index, rowHeaderWidth + cell.column.start, columnHeaderHeight + cell.row.start, cell.column.size, cell.row.size, 1)}
      {/each}
      {#each renderedMerges as merge (`${merge.range.start.row}:${merge.range.start.column}`)}
        {#if merge.range.start.row > frozenRows && merge.range.start.column > frozenColumns}
          {@const reference = formatCellReference(merge.range.start)}
          {@render gridCell(reference, merge.range.start.row, merge.range.start.column, rowHeaderWidth + merge.left, columnHeaderHeight + merge.top, merge.width, merge.height, 1)}
        {/if}
      {/each}
      {#each visibleObjects.filter(frame => frame.placement.region === "body") as frame (frame.object.elementId)}
        <button type="button" aria-label={`Select ${frame.object.name}`} class="drawing-object" style:transform-origin="top left" style:transform={drawingTransform(frame.object.objectId)} data-drawing-id={frame.object.objectId} onclick={(event)=>{event.stopPropagation();onobjectselectionchange?.(frame.object.objectId);}} class:selected={objectSelection===frame.object.objectId} onpointerdown={event=>drawingPointerDown(event,frame.object.objectId,frame.bounds)} style:position="absolute" style:z-index={3 + (worksheet.drawing?.anchors.findIndex(anchor => anchor.elementId === frame.anchor.elementId) ?? 0)} style:left={`${frame.placement.left - columnOrigin}px`} style:top={`${frame.placement.top - rowOrigin}px`} style:width={`${Math.max(1, frame.bounds.width)}px`} style:height={`${Math.max(1, frame.bounds.height)}px`}>
          <SpreadsheetDrawingObject object={frame.object} />
          {#if !readonly && objectSelection===frame.object.objectId}<span class="drawing-resize" data-resize></span>{/if}
        </button>
      {/each}
      {#each visibleCharts.filter((chart) => chart.placement.region === "body") as chart (chart.frame.anchor.elementId)}
        {@render chartFrame(chart, chart.placement.left - columnOrigin, chart.placement.top - rowOrigin)}
      {/each}
      </div>
    </div>
  </div>
  {#if frozenRowsHeight > 0}
    <div class="frozen-row-pane" style:height={`${frozenRowsHeight}px`}>
      {#each renderedRows.filter((row) => row.index <= frozenRows) as row (row.index)}
        {#each renderedColumns as column (column.index)}
          {@const projectedRow = sourceRow(row.index)}
          {@const reference = formatCellReference({ row: projectedRow ?? row.index, column: column.index })}
          {#if projectedRow !== undefined && worksheet.mergedRange(reference) === undefined}
            {@render gridCell(reference, projectedRow, column.index, column.start - (column.index <= frozenColumns ? 0 : scrollLeft), row.start, column.size, row.size, 2)}
          {/if}
        {/each}
      {/each}
      {#each renderedMerges.filter((merge) => merge.range.start.row <= frozenRows) as merge (`${merge.range.start.row}:${merge.range.start.column}`)}
        {@const reference = formatCellReference(merge.range.start)}
        {@render gridCell(reference, merge.range.start.row, merge.range.start.column, merge.left - (merge.range.start.column <= frozenColumns ? 0 : scrollLeft), merge.top, merge.width, merge.height, 2)}
      {/each}
      {#each visibleObjects.filter(frame => frame.placement.region === "frozen-row") as frame (frame.object.elementId)}
        <button type="button" aria-label={`Select ${frame.object.name}`} class="drawing-object" style:transform-origin="top left" style:transform={drawingTransform(frame.object.objectId)} data-drawing-id={frame.object.objectId} onclick={(event)=>{event.stopPropagation();onobjectselectionchange?.(frame.object.objectId);}} class:selected={objectSelection===frame.object.objectId} onpointerdown={event=>drawingPointerDown(event,frame.object.objectId,frame.bounds)} style:position="absolute" style:z-index={3 + (worksheet.drawing?.anchors.findIndex(anchor => anchor.elementId === frame.anchor.elementId) ?? 0)} style:left={`${frame.placement.left}px`} style:top={`${frame.placement.top}px`} style:width={`${Math.max(1, frame.bounds.width)}px`} style:height={`${Math.max(1, frame.bounds.height)}px`}>
          <SpreadsheetDrawingObject object={frame.object} />
          {#if !readonly && objectSelection===frame.object.objectId}<span class="drawing-resize" data-resize></span>{/if}
        </button>
      {/each}
      {#each visibleCharts.filter((chart) => chart.placement.region === "frozen-row") as chart (chart.frame.anchor.elementId)}
        {@render chartFrame(chart, chart.placement.left, chart.placement.top)}
      {/each}
    </div>
  {/if}
  {#if frozenColumnsWidth > 0}
    <div class="frozen-column-pane" style:width={`${frozenColumnsWidth}px`} style:top={`${columnHeaderHeight + frozenRowsHeight}px`}>
      {#each renderedRows.filter((row) => row.index > frozenRows) as row (row.index)}
        {#each renderedColumns.filter((column) => column.index <= frozenColumns) as column (column.index)}
          {@const projectedRow = sourceRow(row.index)}
          {@const reference = formatCellReference({ row: projectedRow ?? row.index, column: column.index })}
          {#if projectedRow !== undefined && worksheet.mergedRange(reference) === undefined}
            {@render gridCell(reference, projectedRow, column.index, column.start, row.start - scrollTop - frozenRowsHeight, column.size, row.size, 2)}
          {/if}
        {/each}
      {/each}
      {#each renderedMerges.filter((merge) => merge.range.start.row > frozenRows && merge.range.start.column <= frozenColumns) as merge (`${merge.range.start.row}:${merge.range.start.column}`)}
        {@const reference = formatCellReference(merge.range.start)}
        {@render gridCell(reference, merge.range.start.row, merge.range.start.column, merge.left, merge.top - scrollTop - frozenRowsHeight, merge.width, merge.height, 2)}
      {/each}
      {#each visibleObjects.filter(frame => frame.placement.region === "frozen-column") as frame (frame.object.elementId)}
        <button type="button" aria-label={`Select ${frame.object.name}`} class="drawing-object" style:transform-origin="top left" style:transform={drawingTransform(frame.object.objectId)} data-drawing-id={frame.object.objectId} onclick={(event)=>{event.stopPropagation();onobjectselectionchange?.(frame.object.objectId);}} class:selected={objectSelection===frame.object.objectId} onpointerdown={event=>drawingPointerDown(event,frame.object.objectId,frame.bounds)} style:position="absolute" style:z-index={3 + (worksheet.drawing?.anchors.findIndex(anchor => anchor.elementId === frame.anchor.elementId) ?? 0)} style:left={`${frame.placement.left}px`} style:top={`${frame.placement.top}px`} style:width={`${Math.max(1, frame.bounds.width)}px`} style:height={`${Math.max(1, frame.bounds.height)}px`}>
          <SpreadsheetDrawingObject object={frame.object} />
          {#if !readonly && objectSelection===frame.object.objectId}<span class="drawing-resize" data-resize></span>{/if}
        </button>
      {/each}
      {#each visibleCharts.filter((chart) => chart.placement.region === "frozen-column") as chart (chart.frame.anchor.elementId)}
        {@render chartFrame(chart, chart.placement.left, chart.placement.top)}
      {/each}
    </div>
  {/if}
  <div class="column-gutter">
    <div class="scrolling-column-headers" style:left={`${frozenColumnsWidth}px`}>
      {#each renderedColumns.filter((column) => column.index > frozenColumns) as column (column.index)}
        <div
          data-column={column.index} tabindex="0" role="button" onclick={(event) => selectHeader(column.index, false, event.shiftKey)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectHeader(column.index, false, event.shiftKey); } }} aria-label={`Column ${columnLabel(column.index)}`} class="column-header" class:selected-header={column.index >= selection.range.start.column && column.index <= selection.range.end.column}
          style:left={`${column.start - scrollLeft - frozenColumnsWidth}px`}
          style:width={`${column.size}px`}
        >{columnLabel(column.index)}</div>
      {/each}
    </div>
    {#if frozenColumnsWidth > 0}
      <div class="frozen-column-headers" style:width={`${frozenColumnsWidth}px`}>
        {#each renderedColumns.filter((column) => column.index <= frozenColumns) as column (column.index)}
          <div data-column={column.index} tabindex="0" role="button" onclick={(event) => selectHeader(column.index, false, event.shiftKey)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectHeader(column.index, false, event.shiftKey); } }} aria-label={`Column ${columnLabel(column.index)}`} class="column-header" class:selected-header={column.index >= selection.range.start.column && column.index <= selection.range.end.column} style:left={`${column.start}px`} style:width={`${column.size}px`}>{columnLabel(column.index)}</div>
        {/each}
      </div>
    {/if}
  </div>
  <div class="row-gutter">
    <div class="scrolling-row-headers" style:top={`${frozenRowsHeight}px`}>
      {#each renderedRows.filter((row) => row.index > frozenRows) as row (row.index)}
        <div
          data-row={sourceRow(row.index) ?? row.index} tabindex="0" role="button" onclick={(event) => selectHeader(sourceRow(row.index) ?? row.index, true, event.shiftKey)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectHeader(sourceRow(row.index) ?? row.index, true, event.shiftKey); } }} aria-label={`Row ${sourceRow(row.index) ?? row.index}`} class="row-header" class:selected-header={(sourceRow(row.index) ?? 0) >= selection.range.start.row && (sourceRow(row.index) ?? 0) <= selection.range.end.row}
          style:top={`${row.start - scrollTop - frozenRowsHeight}px`}
          style:height={`${row.size}px`}
        >{row.index}</div>
      {/each}
    </div>
    {#if frozenRowsHeight > 0}
      <div class="frozen-row-headers" style:height={`${frozenRowsHeight}px`}>
        {#each renderedRows.filter((row) => row.index <= frozenRows) as row (row.index)}
          <div data-row={sourceRow(row.index) ?? row.index} tabindex="0" role="button" onclick={(event) => selectHeader(sourceRow(row.index) ?? row.index, true, event.shiftKey)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); selectHeader(sourceRow(row.index) ?? row.index, true, event.shiftKey); } }} aria-label={`Row ${sourceRow(row.index) ?? row.index}`} class="row-header" class:selected-header={(sourceRow(row.index) ?? 0) >= selection.range.start.row && (sourceRow(row.index) ?? 0) <= selection.range.end.row} style:top={`${row.start}px`} style:height={`${row.size}px`}>{row.index}</div>
        {/each}
      </div>
    {/if}
  </div>
  {#each highlightRects as source}
    {#each source.rects as rect}
      <div aria-hidden="true" class="range-highlight" style:--source-color={source.color}
        class:top-edge={rect.topEdge} class:bottom-edge={rect.bottomEdge} class:left-edge={rect.leftEdge} class:right-edge={rect.rightEdge}
        style:left={`${rect.left}px`} style:top={`${rect.top}px`} style:width={`${rect.width}px`} style:height={`${rect.height}px`}></div>
    {/each}
  {/each}
  {#each selectionRects as rect}
    <div class="selection-outline" class:top-edge={rect.topEdge} class:bottom-edge={rect.bottomEdge} class:left-edge={rect.leftEdge} class:right-edge={rect.rightEdge}
      style:left={`${rect.left}px`} style:top={`${rect.top}px`} style:width={`${rect.width}px`} style:height={`${rect.height}px`}></div>
  {/each}
  {#each remoteRects as peer (peer.id)}
    {#each peer.rects as rect, index}
      <div class="remote-selection" style:--peer-color={peer.color}
        class:top-edge={rect.topEdge} class:bottom-edge={rect.bottomEdge} class:left-edge={rect.leftEdge} class:right-edge={rect.rightEdge}
        style:left={`${rect.left}px`} style:top={`${rect.top}px`} style:width={`${rect.width}px`} style:height={`${rect.height}px`}>
        {#if index === 0}<span class="remote-name">{peer.name}</span>{/if}
      </div>
    {/each}
  {/each}
  <div class="corner"></div>
</div>

</div>

{#if tableMenu !== undefined && menuTable() !== undefined}
  {@const table = menuTable()!}
  {@const values = tableDistinctValues(table, tableMenu.columnId)}
  <button class="menu-scrim" aria-label="Close table menu" onclick={() => tableMenu = undefined}></button>
  <div class="table-menu" role="menu" style:left={`${Math.max(8, tableMenu.left)}px`} style:top={`${tableMenu.top}px`}>
    <button type="button" role="menuitem" onclick={() => sortTable(table, tableMenu!.columnId, "ascending")}>Sort ascending</button>
    <button type="button" role="menuitem" onclick={() => sortTable(table, tableMenu!.columnId, "descending")}>Sort descending</button>
    <button type="button" role="menuitem" onclick={() => clearTableFilter(table, tableMenu!.columnId)}>Clear filter</button>
    <div class="menu-values" role="group" aria-label="Visible values">
      {#each values as value (value)}
        <label>
          <input type="checkbox" checked={valueChecked(table, tableMenu.columnId, value)} onchange={(event) => toggleTableValue(table, tableMenu!.columnId, value, event.currentTarget.checked)} />
          <span>{value === "" ? "Blank" : value}</span>
        </label>
      {/each}
    </div>
  </div>
{/if}

<SpreadsheetFormulaAutocomplete input={editor} disabled={!editable || !editing || spreadsheetCellUsesTextFormat(worksheet, editing)}
  oncomplete={(value, caret) => {
    draft = value;
    editingText = true;
    void tick().then(() => { editor?.focus({ preventScroll: true }); editor?.setSelectionRange(caret, caret); });
  }} />

<style>
  .range-highlight { position: absolute; pointer-events: none; z-index: 5; box-sizing: border-box; border: 0 solid var(--source-color); background: color-mix(in srgb, var(--source-color) 8%, transparent); }
  .range-highlight.top-edge { border-top-width: 1px; }
  .range-highlight.bottom-edge { border-bottom-width: 1px; }
  .range-highlight.left-edge { border-left-width: 1px; }
  .range-highlight.right-edge { border-right-width: 1px; }
  .remote-selection { position: absolute; pointer-events: none; z-index: 8; box-sizing: border-box; border: 0 solid var(--peer-color); background: color-mix(in srgb, var(--peer-color) 10%, transparent); }
  .remote-selection.top-edge { border-top-width: 2px; }
  .remote-selection.bottom-edge { border-bottom-width: 2px; }
  .remote-selection.left-edge { border-left-width: 2px; }
  .remote-selection.right-edge { border-right-width: 2px; }
  .remote-name { position: absolute; left: -2px; top: 0; padding: 2px 5px; background: var(--peer-color); color: white; font-size: 11px; white-space: nowrap; border-radius: 3px 3px 0 0; }

  .scrolling-cells {
    will-change: transform;
    contain: layout style;
    position: absolute;
    left: 0;
    top: 0;
  }
  .body-cells :global(.painted-row) { position: absolute; pointer-events: auto; z-index: 0; }
  .grid-viewport { width: 100%; height: 100%; overflow: hidden; touch-action: pan-x pan-y; }
  .tumbler-grid { transform-origin: top left; touch-action: pan-x pan-y; position: relative; overflow: hidden; color: var(--tumbler-grid-fg, #d8e2d8); background: var(--tumbler-grid-bg, #111411); outline: none; font: 13px/1.3 system-ui, sans-serif; user-select: none; -webkit-user-select: none; }
  .grid-scroller { width: 100%; height: 100%; overflow: auto; overscroll-behavior: contain; }
  .empty-grid { background: var(--tumbler-sheet-bg, #ffffff); position: absolute; pointer-events: none; fill: none; stroke: var(--tumbler-sheet-line, #d9ded9); stroke-width: 1; }
  .empty-selection { position: absolute; pointer-events: none; background: var(--tumbler-grid-selection-bg, rgba(0, 0, 0, 0.16)); }
  .empty-focus { pointer-events: none; }
  .tumbler-grid :global(.cell.active.selected::after) { background: transparent; }
  .drawing-resize { position:absolute;right:0;bottom:0;width:10px;height:10px;background:var(--tumbler-grid-accent,#42ff53);cursor:nwse-resize;z-index:1; }
  .drawing-object.selected { outline:2px solid var(--tumbler-grid-accent,#42ff53); }
  .drawing-object { padding:0;border:0;background:transparent;pointer-events:auto; }
  .drawing-object:focus-visible { outline:2px solid var(--tumbler-grid-accent,#42ff53); }
  .canvas { isolation: isolate; position: relative; overflow: clip; color: var(--tumbler-sheet-fg, #111111); background: var(--tumbler-sheet-bg, #ffffff); }
  .frozen-row-pane, .frozen-column-pane { position: absolute; z-index: 2; overflow: hidden; pointer-events: none; background: var(--tumbler-sheet-bg, #ffffff); }
  .frozen-row-pane { left: var(--tumbler-header-width); right: 0; top: var(--tumbler-header-height); }
  .frozen-column-pane { left: var(--tumbler-header-width); bottom: 0; }
  .frozen-row-pane :global(.cell), .frozen-column-pane :global(.cell), .frozen-row-pane .chart-frame, .frozen-column-pane .chart-frame { pointer-events: auto; }
  .no-gridlines :global(.cell) { border-color: transparent; }
  .no-gridlines .empty-grid { stroke: transparent; }
  .no-headings .column-gutter, .no-headings .row-gutter, .no-headings .corner { visibility: hidden; }
  .column-header, .row-header { pointer-events: auto; }
  .column-gutter { position: absolute; left: 52px; right: 0; top: 0; z-index: 3; height: 28px; overflow: hidden; pointer-events: none; background: var(--tumbler-grid-header-bg, #171b17); }
  .row-gutter { position: absolute; left: 0; top: 28px; bottom: 0; z-index: 3; width: 52px; overflow: hidden; pointer-events: none; background: var(--tumbler-grid-header-bg, #171b17); }
  .scrolling-column-headers, .frozen-column-headers, .scrolling-row-headers, .frozen-row-headers { position: absolute; overflow: hidden; }
  .scrolling-column-headers { right: 0; top: 0; bottom: 0; }
  .frozen-column-headers { left: 0; top: 0; bottom: 0; z-index: 1; background: var(--tumbler-grid-header-bg, #171b17); }
  .scrolling-row-headers { left: 0; right: 0; bottom: 0; }
  .frozen-row-headers { left: 0; right: 0; top: 0; z-index: 1; background: var(--tumbler-grid-header-bg, #171b17); }
  .corner, .column-header, .row-header { position: absolute; box-sizing: border-box; background: var(--tumbler-grid-header-bg, #171b17); color: var(--tumbler-grid-muted, #9aa79a); border: 0 solid var(--tumbler-grid-line, #2a302a); }
  .corner { left: 0; top: 0; width: 52px; height: 28px; border-right-width: 1px; border-bottom-width: 1px; z-index: 4; pointer-events: none; }
  .column-header { top: 0; height: 28px; display: grid; place-items: center; border-right-width: 1px; border-bottom-width: 1px; }
  .row-header { left: 0; width: 52px; display: grid; place-items: center; border-right-width: 1px; border-bottom-width: 1px; }
  .tumbler-grid :global(.cell) { position: absolute; z-index: 1; box-sizing: border-box; display: flex; align-items: flex-end; overflow: hidden; padding: 1px 8px; line-height: normal; white-space: nowrap; text-overflow: ellipsis; color: var(--tumbler-sheet-fg, #111111); border-right: 1px solid var(--tumbler-sheet-line, #d9ded9); border-bottom: 1px solid var(--tumbler-sheet-line, #d9ded9); background: var(--tumbler-sheet-bg, #ffffff); }
  .tumbler-grid :global(.cell.text-overflow) { overflow: visible; }
  .tumbler-grid :global(.cell > .overflow-content) { flex: none; max-width: none; overflow: hidden; pointer-events: none; }
  .chart-frame { position: absolute; z-index: 2; overflow: hidden; box-sizing: border-box; padding: 0; border: 0; outline: 0; background: transparent; cursor: default; }
  .chart-frame.selected, .chart-frame:focus-visible { box-shadow: inset 0 0 0 2px var(--tumbler-grid-accent, #42ff53); }
  .tumbler-grid :global(.cell.selected::after) { content: ""; position: absolute; inset: 0; z-index: 0; pointer-events: none; background: var(--tumbler-grid-selection-bg, rgba(0, 0, 0, 0.16)); }
  .tumbler-grid :global(.cell.focused) { z-index: 2; }
  .tumbler-grid :global(.cell.active) { z-index: 2; }
  .selection-outline { position:absolute; z-index:5; pointer-events:none; box-sizing:border-box; border:0 solid var(--tumbler-grid-accent,#42ff53); }
  .selection-outline.top-edge { border-top-width:2px; }
  .selection-outline.bottom-edge { border-bottom-width:2px; }
  .selection-outline.left-edge { border-left-width:2px; }
  .selection-outline.right-edge { border-right-width:2px; }
  .selected-header { background:var(--tumbler-grid-selected-header-bg,#525852); color:var(--tumbler-grid-selected-header-fg,#fff); }
  .tumbler-grid :global(.cell > *) { position: relative; z-index: 1; min-width: 0; max-width: 100%; transform-origin: center; }
  .tumbler-grid :global(.cell.table-header) { align-items: center; font-weight: 600; padding-right: 30px; }
  .table-menu-button { position: absolute; right: 4px; top: 50%; width: 20px; height: 20px; padding: 0; translate: 0 -50%; border: 1px solid transparent; border-radius: 3px; color: inherit; background: color-mix(in srgb, currentColor 10%, transparent); cursor: pointer; }
  .table-menu-button:hover, .table-menu-button:focus-visible, .table-menu-button.active { border-color: var(--tumbler-grid-accent, #42ff53); outline: none; }
  .cell-hyperlink { overflow: hidden; padding: 0; border: 0; color: inherit; background: transparent; font: inherit; text-align: inherit; text-decoration: inherit; text-overflow: inherit; white-space: inherit; cursor: pointer; }
  .cell-hyperlink:focus-visible { outline: 1px solid currentColor; outline-offset: 1px; }
  .menu-scrim { position: fixed; inset: 0; z-index: 9998; border: 0; background: transparent; }
  .table-menu { position: fixed; z-index: 9999; width: 220px; overflow: hidden; border: 1px solid var(--tumbler-grid-line, #2a302a); border-radius: 8px; color: var(--tumbler-grid-fg, #d8e2d8); background: var(--tumbler-grid-header-bg, #171b17); box-shadow: 0 12px 36px rgb(0 0 0 / 35%); font: 13px/1.3 system-ui, sans-serif; }
  .table-menu > button { display: block; width: 100%; padding: 9px 12px; border: 0; color: inherit; background: transparent; text-align: left; cursor: pointer; }
  .table-menu > button:hover, .table-menu > button:focus-visible { background: color-mix(in srgb, var(--tumbler-grid-accent, #42ff53) 12%, transparent); outline: none; }
  .menu-values { max-height: 220px; overflow: auto; padding: 6px 0; border-top: 1px solid var(--tumbler-grid-line, #2a302a); }
  .menu-values label { display: flex; gap: 8px; align-items: center; padding: 6px 12px; cursor: pointer; }
  .menu-values label:hover { background: color-mix(in srgb, var(--tumbler-grid-accent, #42ff53) 8%, transparent); }
  .tumbler-grid :global(.cell input) { width: 100%; height: 100%; box-sizing: border-box; border: 0; outline: 0; padding: 0; color: inherit; background: transparent; font: inherit; user-select: text; -webkit-user-select: text; }
</style>
