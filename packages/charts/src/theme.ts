import { THEME_COLOR_SLOTS, type ThemeColorScheme, type ThemeFontScheme } from '@tumblerjs/ooxml';
import type { ChartModel } from './model.ts';

/** Resolve the host template at render time while retaining authored scheme and font references. */
export function bindChartTheme(model: ChartModel, colors: ThemeColorScheme, fonts?: ThemeFontScheme): ChartModel {
  const themeColors: Record<string, string> = Object.fromEntries(THEME_COLOR_SLOTS.flatMap(slot => { const value = colors.color(slot); return value ? [[slot, `#${value}`]] : []; }));
  for (const [alias, slot] of Object.entries({ bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' })) if (themeColors[slot]) themeColors[alias] = themeColors[slot]!;
  const themeFonts: Record<string, string> = {};
  for (const role of ['major', 'minor'] as const) {
    const face = fonts?.typeface(role, 'latin');
    if (face) themeFonts[role === 'major' ? '+mj-lt' : '+mn-lt'] = face;
  }
  return { ...model, themeColors, themeFonts, ...(model.status === 'supported' && model.plots ? { plots: model.plots.map(plot => ({ ...plot, themeColors, themeFonts })) } : {}) };
}
