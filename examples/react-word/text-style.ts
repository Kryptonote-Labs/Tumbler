import type { CSSProperties } from 'react';
import {
  wordFontFamily, wordFontKerning, wordHighlightColor,
  type WordLayoutFragment,
} from '@tumblerjs/word';

const baselines = new Map<string, number>();

/** Measure the CSS baseline so positioned DOM text uses the native layout's baseline. */
function baselineOffset(fragment: WordLayoutFragment, family: string) {
  const { format, height } = fragment;
  const font = `${format.italic ? 'italic' : 'normal'} ${format.bold ? 700 : 400} ${format.fontSizePoints}pt ${family}`;
  const key = `${font}/${height}`;
  const cached = baselines.get(key);
  if (cached !== undefined) return cached;
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;top:-10000px;visibility:hidden;display:inline-block;white-space:pre;padding:0;border:0;margin:0';
  probe.style.font = font;
  probe.style.lineHeight = `${height}pt`;
  probe.textContent = 'M';
  const marker = document.createElement('span');
  marker.style.cssText = 'display:inline-block;vertical-align:baseline;width:0;height:0;padding:0;border:0';
  probe.append(marker);
  document.body.append(probe);
  const offset = (marker.getBoundingClientRect().top - probe.getBoundingClientRect().top) * 3 / 4;
  probe.remove();
  baselines.set(key, offset);
  return offset;
}

export function fragmentStyle(fragment: WordLayoutFragment, lineY: number, gap: number): CSSProperties {
  const { format } = fragment;
  const family = wordFontFamily(format.fontFamily);
  const highlight = wordHighlightColor(format.highlight);
  return {
    fontFamily: family,
    fontSize: `${format.fontSizePoints}pt`,
    fontWeight: format.bold ? 700 : 400,
    fontStyle: format.italic ? 'italic' : 'normal',
    fontKerning: wordFontKerning(format),
    color: format.color,
    backgroundColor: highlight === 'transparent' ? format.shading : highlight,
    textDecorationLine: [format.underline !== 'none' ? 'underline' : '', format.strike ? 'line-through' : ''].join(' '),
    textDecorationStyle: format.underline === 'double' ? 'double' : 'solid',
    direction: format.rightToLeft ? 'rtl' : 'ltr',
    letterSpacing: `${format.characterSpacingPoints ?? 0}pt`,
    wordSpacing: `${fragment.wordSpacing ?? 0}pt`,
    lineHeight: `${fragment.height}pt`,
    marginLeft: `${gap}pt`,
    top: `${fragment.baseline - baselineOffset(fragment, family) - lineY}pt`,
  };
}
