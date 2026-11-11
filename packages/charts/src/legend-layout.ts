import type { ChartSceneOptions } from './scene-marks.ts';
import type { SupportedChartModel } from './model.ts';
import { chartFont, type ChartColorResolver, type ChartFont } from './scene-style.ts';
import { chartLegendEntries } from './legend-style.ts';
import { chartLegendItems } from './legend-items.ts';

type Measure = (text: string, font: ChartFont) => number;

function wrap(text: string, font: ChartFont, width: number, measure: Measure): string[] {
  return text.split(/\r?\n/).flatMap(paragraph => {
    const lines: string[] = []; let line = '';
    for (const word of paragraph.match(/\S+\s*|\s+/gu) ?? []) {
      if (line && measure(line + word.trimEnd(), font) > width) { lines.push(line.trimEnd()); line = ''; }
      for (const character of word) {
        if (line && measure(line + character, font) > width) { lines.push(line.trimEnd()); line = ''; }
        line += character;
      }
    }
    lines.push(line.trimEnd()); return lines;
  });
}

/** One measured list supplies both painted entries and automatic plot reservation. */
export function layoutChartLegend(model: SupportedChartModel, width: number, height: number, measure: Measure, bands?: readonly number[], resolve?: ChartColorResolver, options: ChartSceneOptions = {}) {
  const pie = ['pie', 'doughnut', 'of-pie'].includes(model.kind);
  const labelX = pie || model.kind === 'bubble' || model.kind === 'scatter' ? 15 : model.kind === 'surface' ? 14 : 12;
  const position = model.legend?.position ?? 'right', horizontal = position === 'top' || position === 'bottom';
  const padding = pie ? 16 : 8, available = Math.max(1, width - padding * 2);
  const shown = chartLegendEntries(model, chartLegendItems(model, bands, { dateSystem: model.dateSystem ?? '1900', ...options }), resolve);
  const fontSize = shown.length ? Math.max(...shown.map(entry => entry.font.size)) : chartFont('legend', model.legend?.textStyle, model).size;
  const gap = fontSize * .4;
  const entries = shown.map(entry => {
    const lineWidth = horizontal ? available : Math.max(1, Math.min(available, width * .4, width - padding * 4 - 1));
    const lines = wrap(entry.label, entry.font, Math.max(1, lineWidth - labelX), measure);
    return { ...entry, lines, width: labelX + Math.max(0, ...lines.map(line => measure(line, entry.font))), inkHeight: entry.font.size * (1 + (lines.length - 1) * 1.2) };
  });
  const rows: Array<{ entries: typeof entries; width: number; fontSize: number; inkHeight: number; advance: number }> = [];
  for (const entry of entries) {
    let row = rows.at(-1);
    const stride = row?.entries.length ? Math.max(pie ? 110 : 0, row.entries.at(-1)!.width + gap) : 0;
    const nextWidth = row ? row.width - (row.entries.at(-1)?.width ?? 0) + stride + entry.width : entry.width;
    if (!row || !horizontal || nextWidth > available && row.entries.length) {
      row = { entries: [], width: 0, fontSize: 0, inkHeight: 0, advance: 0 }; rows.push(row);
    } else row.width = nextWidth - entry.width;
    row.entries.push(entry); row.width += entry.width;
    row.fontSize = Math.max(row.fontSize, entry.font.size);
    row.inkHeight = Math.max(...row.entries.map(item => row!.fontSize - item.font.size + item.inkHeight));
    row.advance = Math.max(pie ? 20 : 0, row.fontSize * (pie ? 1.5 : 1.7), row.inkHeight + gap);
  }
  const rowsHeight = rows.reduce((sum, row) => sum + row.advance, 0);
  const last = rows.at(-1), inkHeight = rowsHeight - (last?.advance ?? 0) + (last?.inkHeight ?? 0);
  const titleHeight = model.title === undefined || model.titleOverlay ? 16 : 36;
  const topBaseline = pie ? titleHeight + Math.max(16, rows[0]?.fontSize ?? 0) : (model.title === undefined ? 18 : 48) + Math.max(0, fontSize - 40 / 3);
  let top = position === 'bottom' ? pie ? height - rowsHeight - 24 + Math.max(0, 16 - (rows[0]?.fontSize ?? 0)) : height - 16 - inkHeight
    : position === 'top' || position === 'top-right' ? topBaseline - (rows[0]?.fontSize ?? 0)
    : pie ? titleHeight + Math.max(16, rows[0]?.fontSize ?? 0) - (rows[0]?.fontSize ?? 0) : (height - rowsHeight) / 2;
  const maxWidth = Math.max(0, ...rows.map(row => row.width));
  const placed = rows.flatMap(row => {
    let x = horizontal ? Math.max(padding, (width - row.width) / 2) : position === 'left' ? padding : width - Math.max(pie ? Math.min(120, width * .25) : 0, maxWidth + padding);
    const y = top + row.fontSize; top += row.advance;
    return row.entries.map(entry => { const point = { ...entry, x, y }; x += Math.max(pie ? 110 : 0, entry.width + gap); return point; });
  });
  const bounds = { x: Math.min(width, ...placed.map(entry => entry.x)), y: Math.min(height, ...placed.map(entry => entry.y - entry.font.size)),
    width: maxWidth, height: inkHeight };
  const reserve = !!model.legend && !model.legend.overlay && placed.length > 0;
  return { entries: placed, labelX, bounds, rowsHeight, space: {
    left: reserve && position === 'left' ? Math.max(pie ? Math.min(120, width * .25) : 0, maxWidth + padding * 2) : 0,
    right: reserve && (position === 'right' || position === 'top-right') ? Math.max(pie ? Math.min(120, width * .25) : 0, maxWidth + padding * 2) : 0,
    top: reserve && position === 'top' ? pie ? rowsHeight + 8 : Math.max(28, inkHeight + 44 / 3) : 0,
    bottom: reserve && position === 'bottom' ? pie ? rowsHeight + 8 : height - bounds.y + 10 : 0,
  } };
}
