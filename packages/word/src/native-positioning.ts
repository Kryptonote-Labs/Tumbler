import type { WordParagraphPositioning } from './positioning.ts';
import type { WordStyles } from './styles.ts';
import { mergeWordTabStops } from './tab-stops.ts';

const inherited = new WeakMap<WordStyles, Map<string, ReturnType<WordStyles['resolveParagraphStyle']>['paragraph']>>();

/** Resolve direct positioning against export's styles, retaining source clears until replaced. */
export function nativeParagraphPositioning(
  styles: WordStyles, selected: string | undefined, positioning: WordParagraphPositioning | undefined,
  source: WordParagraphPositioning | undefined, resetStyle: boolean,
) {
  const styleId = selected && styles.style(selected)?.type === 'paragraph' ? selected
    : styles.styles.find(style => style.type === 'paragraph' && style.isDefault)?.styleId ?? '';
  const cache = inherited.get(styles) ?? new Map<string, ReturnType<WordStyles['resolveParagraphStyle']>['paragraph']>();
  inherited.set(styles, cache);
  const format = cache.get(styleId) ?? styles.resolveParagraphStyle(styleId).paragraph;
  cache.set(styleId, format);
  const { tabs, indentStartTwips, indentEndTwips, firstLineTwips, hangingTwips } = format;
  const { reset: _reset, tabs: replacement, ...indents } = positioning ?? {};
  const retained = positioning?.reset || resetStyle && positioning === undefined ? undefined : source;
  return {
    indentStartTwips, indentEndTwips, firstLineTwips, hangingTwips, ...retained, ...indents,
    tabs: mergeWordTabStops(tabs, replacement ?? retained?.tabs ?? []),
  };
}
