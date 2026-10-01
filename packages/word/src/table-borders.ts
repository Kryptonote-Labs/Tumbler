/** Word line borders use points; DOCX stores their width in eighths of a point. */
export interface WordBorder {
  readonly color: string;
  readonly width: number;
  readonly style: 'single' | 'double' | 'dotted' | 'dashed' | 'none';
}
export const WORD_BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type WordBorderSide = typeof WORD_BORDER_SIDES[number];
export type WordCellBorders = Partial<Record<WordBorderSide, WordBorder>>;
export type WordTableBorders = WordCellBorders & { readonly insideH?: WordBorder; readonly insideV?: WordBorder };
export type WordBorderEdges = 'all' | 'outside' | 'inside' | WordBorderSide;
export const DEFAULT_WORD_BORDER: WordBorder = Object.freeze({ color: '#000000', width: 0.75, style: 'single' });
export const DEFAULT_WORD_TABLE_BORDERS: WordTableBorders = Object.freeze(Object.fromEntries(
  [...WORD_BORDER_SIDES, 'insideH', 'insideV'].map(side => [side, DEFAULT_WORD_BORDER]),
));
export const NO_WORD_BORDER: WordBorder = Object.freeze({ color: '#000000', width: 0, style: 'none' });

export function isWordBorder(value: unknown): value is WordBorder {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    'color' in value && typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color) &&
    'width' in value && typeof value.width === 'number' && Number.isFinite(value.width) && Number.isSafeInteger(Math.round(value.width * 8)) && value.width >= 0 &&
    'style' in value && typeof value.style === 'string' && ['single', 'double', 'dotted', 'dashed', 'none'].includes(String(value.style)) &&
    (value.style === 'none' || value.width > 0) &&
    Object.keys(value).every(key => ['color', 'width', 'style'].includes(key));
}

export function normalizeWordBorders<T extends WordCellBorders | WordTableBorders>(borders: T): T {
  const result = { ...borders };
  for (const side of Object.keys(result) as (keyof T)[]) {
    const border = result[side];
    if (!['top', 'right', 'bottom', 'left', 'insideH', 'insideV'].includes(String(side)) || !isWordBorder(border))
      throw new TypeError('Invalid table border.');
    // Round once so native layout and exported DOCX agree.
    Object.assign(result, { [side]: Object.freeze({ ...border, color: border.color.toUpperCase(), width: Math.max(border.style === 'none' ? 0 : 0.125, Math.round(border.width * 8) / 8) }) });
  }
  return Object.freeze(result);
}

export interface WordBorderCell {
  readonly row: number;
  readonly column: number;
  readonly rowSpan?: number;
  readonly columnSpan?: number;
  readonly borders?: WordCellBorders;
}

/** Resolves explicit cell edges over table defaults. Absent imported borders stay absent. */
export function resolveWordCellBorders(cell: WordBorderCell, rows: number, columns: number, table: WordTableBorders = {}): WordCellBorders {
  return Object.fromEntries(WORD_BORDER_SIDES.map(side => {
    const outer = side === 'top' ? cell.row === 0 : side === 'left' ? cell.column === 0
      : side === 'bottom' ? cell.row + (cell.rowSpan ?? 1) === rows : cell.column + (cell.columnSpan ?? 1) === columns;
    return [side, cell.borders?.[side] ?? table[outer ? side : side === 'top' || side === 'bottom' ? 'insideH' : 'insideV'] ?? NO_WORD_BORDER];
  }));
}

/** Applies an edge patch to selected cells and their neighbours' matching edges. */
export function editWordTableBorders<T extends WordBorderCell>(cells: readonly T[], selected: readonly number[], edges: WordBorderEdges, patch: Partial<WordBorder>) {
  if (!['all', 'outside', 'inside', ...WORD_BORDER_SIDES].includes(edges)) throw new TypeError('Invalid border edges.');
  if (!selected.length || selected.some(index => !Number.isInteger(index) || !cells[index])) throw new RangeError('Select existing table cells.');
  const selection = new Set(selected);
  const result = cells.map(cell => ({ ...cell, borders: { ...cell.borders } }));
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const;
  const edgeCells = new Map<string, number[]>();
  const edgeKeys = (cell: WordBorderCell, side: WordBorderSide) => {
    const horizontal = side === 'top' || side === 'bottom';
    const line = horizontal ? cell.row + (side === 'bottom' ? cell.rowSpan ?? 1 : 0)
      : cell.column + (side === 'right' ? cell.columnSpan ?? 1 : 0);
    const start = horizontal ? cell.column : cell.row;
    const length = horizontal ? cell.columnSpan ?? 1 : cell.rowSpan ?? 1;
    return Array.from({ length }, (_, offset) => `${horizontal ? 'h' : 'v'}:${line}:${start + offset}`);
  };
  cells.forEach((cell, index) => {
    for (const side of WORD_BORDER_SIDES) for (const key of edgeKeys(cell, side)) {
      const existing = edgeCells.get(key) ?? [];
      existing.push(index);
      edgeCells.set(key, existing);
    }
  });
  const neighbours = (index: number, side: WordBorderSide) => [...new Set(
    edgeKeys(cells[index]!, side).flatMap(key => edgeCells.get(key) ?? []).filter(candidate => candidate !== index),
  )];
  for (const index of selected) for (const side of WORD_BORDER_SIDES) {
    const adjacent = neighbours(index, side);
    const internal = adjacent.length > 0 && adjacent.every(index => selection.has(index));
    if (edges === 'outside' ? internal : edges === 'inside' ? !internal : edges !== 'all' && edges !== side) continue;
    const current = { ...DEFAULT_WORD_BORDER, ...cells[index]!.borders?.[side], ...patch };
    if (current.style !== 'none' && current.width === 0 && patch.width === undefined) current.width = DEFAULT_WORD_BORDER.width;
    const border = normalizeWordBorders({ [side]: current })[side]!;
    result[index]!.borders[side] = border;
    for (const neighbour of adjacent) result[neighbour]!.borders[opposite[side]] = border;
  }
  return result;
}

/** CSS line styles shared by DOM renderers. */
export function wordCellBorderCss(borders: WordCellBorders = {}): string {
  return WORD_BORDER_SIDES.map(side => {
    const border = borders[side];
    if (!border || border.style === 'none') return `border-${side}:0`;
    const style = border.style === 'single' ? 'solid' : border.style;
    return `border-${side}:${border.width * 4 / 3}px ${style} ${border.color}`;
  }).join(';');
}

/** Positions the border box around the cell boundaries, without changing text geometry. */
export function wordTableCellCss(cell: { x: number; y: number; width: number; height: number; borders: WordCellBorders }, origin = { x: 0, y: 0 }): string {
  const half = (side: WordBorderSide) => cell.borders[side]?.style === 'none' ? 0 : (cell.borders[side]?.width ?? 0) / 2;
  const left = half('left'), right = half('right'), top = half('top'), bottom = half('bottom');
  const px = (points: number) => points * 4 / 3;
  return `${wordCellBorderCss(cell.borders)};left:${px(cell.x - origin.x - left)}px;top:${px(cell.y - origin.y - top)}px;width:${px(cell.width + left + right)}px;height:${px(cell.height + top + bottom)}px`;
}
