import type { WordPositionalTab } from './document.ts';
import type { WordTabStop } from './styles.ts';

/** Paragraph positioning in Word twips. Omitted members inherit their source values. */
export interface WordParagraphPositioning {
  readonly tabs?: readonly WordTabStop[];
  readonly indentStartTwips?: number;
  readonly indentEndTwips?: number;
  readonly firstLineTwips?: number;
  readonly hangingTwips?: number;
}

export function isWordPositionalTab(value: unknown): value is WordPositionalTab {
  if (!value || typeof value !== 'object') return false;
  const tab = value as Record<string, unknown>;
  return Object.keys(tab).every(key => ['alignment', 'relativeTo', 'leader'].includes(key)) &&
    ['left', 'center', 'right'].includes(String(tab.alignment)) &&
    ['margin', 'indent'].includes(String(tab.relativeTo)) &&
    ['none', 'dot', 'hyphen', 'underscore', 'middleDot'].includes(String(tab.leader));
}

export function isWordParagraphPositioning(value: unknown): value is WordParagraphPositioning {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, member]) => {
    if (key === 'tabs') return Array.isArray(member) && member.every((stop: unknown) => {
      if (!stop || typeof stop !== 'object') return false;
      const item = stop as Record<string, unknown>;
      return Object.keys(item).every(key => ['positionTwips', 'alignment', 'leader'].includes(key)) &&
        Number.isSafeInteger(item.positionTwips) && Math.abs(Number(item.positionTwips)) <= 2147483647 &&
        ['start', 'center', 'end', 'decimal', 'bar', 'clear'].includes(String(item.alignment)) &&
        ['none', 'dot', 'hyphen', 'underscore', 'heavy', 'middleDot'].includes(String(item.leader));
    });
    return ['indentStartTwips', 'indentEndTwips', 'firstLineTwips', 'hangingTwips'].includes(key) &&
      Number.isSafeInteger(member) && Math.abs(Number(member)) <= 2147483647 &&
      (!['firstLineTwips', 'hangingTwips'].includes(key) || Number(member) >= 0);
  });
}

export function positionalTabXml(tab: WordPositionalTab, text: string): string {
  if (text !== '\t' || !isWordPositionalTab(tab)) throw new TypeError('A positional tab occupies one tab character.');
  return `<w:ptab w:alignment="${tab.alignment}" w:relativeTo="${tab.relativeTo}" w:leader="${tab.leader}"/>`;
}

export function paragraphPositioningXml(value: WordParagraphPositioning): { tabs?: string; ind?: string } {
  if (!isWordParagraphPositioning(value)) throw new TypeError('Invalid paragraph positioning.');
  const names = { indentStartTwips: 'start', indentEndTwips: 'end', firstLineTwips: 'firstLine', hangingTwips: 'hanging' } as const;
  const indents = Object.entries(names).flatMap(([key, name]) => {
    const amount = value[key as keyof typeof names];
    return amount === undefined ? [] : [`w:${name}="${amount}"`];
  });
  return {
    ...(value.tabs ? { tabs: `<w:tabs>${value.tabs.map(stop => `<w:tab w:val="${stop.alignment}" w:pos="${stop.positionTwips}" w:leader="${stop.leader}"/>`).join('')}</w:tabs>` } : {}),
    ...(indents.length ? { ind: `<w:ind ${indents.join(' ')}/>` } : {}),
  };
}
