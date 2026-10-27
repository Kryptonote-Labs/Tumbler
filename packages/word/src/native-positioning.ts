import type { WordParagraphPositioning } from './positioning.ts';
import type { WordStyles, WordTabStop } from './styles.ts';
import { mergeWordTabStops } from './tab-stops.ts';

const inherited = new WeakMap<WordStyles, Map<string, ReturnType<WordStyles['resolveParagraphStyle']>['paragraph']>>();

/** Resolve direct positioning against export's styles, retaining source clears until replaced. */
export function nativeParagraphPositioning(
  styles: WordStyles, selected: string | undefined, positioning: WordParagraphPositioning | undefined,
  original: WordParagraphPositioning | undefined, directTabs: readonly WordTabStop[] | undefined, resetStyle: boolean,
) {
  const styleId = selected && styles.style(selected)?.type === 'paragraph' ? selected
    : styles.styles.find(style => style.type === 'paragraph' && style.isDefault)?.styleId ?? '';
  const cache = inherited.get(styles) ?? new Map<string, ReturnType<WordStyles['resolveParagraphStyle']>['paragraph']>();
  inherited.set(styles, cache);
  const format = cache.get(styleId) ?? styles.resolveParagraphStyle(styleId).paragraph;
  cache.set(styleId, format);
  if (positioning?.reset) {
    const { tabs, indentStartTwips, indentEndTwips, firstLineTwips, hangingTwips } = format;
    const { reset: _reset, tabs: replacement, ...indents } = positioning;
    return { indentStartTwips, indentEndTwips, firstLineTwips, hangingTwips, ...indents, tabs: mergeWordTabStops(tabs, replacement ?? []) };
  }
  const declarations = positioning?.tabs === undefined
    ? resetStyle && positioning === undefined ? [] : directTabs ?? []
    : original && JSON.stringify(positioning) === JSON.stringify(original) ? directTabs ?? [] : positioning.tabs;
  return { ...positioning, tabs: mergeWordTabStops(format.tabs, declarations) };
}
