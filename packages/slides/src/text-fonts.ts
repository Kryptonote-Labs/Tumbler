/** Split by script without splitting graphemes, so browser fallback does not choose the wrong authored face. */
export function scriptSegments(text: string, language = ''): {text: string; script: string; kind: 'latin' | 'eastAsian' | 'complexScript'}[] {
  const patterns: readonly [RegExp,string,'eastAsian'|'complexScript'][] = [
    [/\p{Script=Hiragana}|\p{Script=Katakana}/u,'Jpan','eastAsian'],
    [/\p{Script=Hangul}/u,'Hang','eastAsian'],
    [/\p{Script=Han}/u,language.startsWith('ja') ? 'Jpan' : /zh-(TW|HK|MO|Hant)/i.test(language) ? 'Hant' : language.startsWith('ko') ? 'Hang' : 'Hans','eastAsian'],
    [/\p{Script=Arabic}/u,'Arab','complexScript'], [/\p{Script=Hebrew}/u,'Hebr','complexScript'],
    [/\p{Script=Devanagari}/u,'Deva','complexScript'], [/\p{Script=Thai}/u,'Thai','complexScript'],
    [/\p{Script=Bengali}/u,'Beng','complexScript'], [/\p{Script=Tamil}/u,'Taml','complexScript'],
    [/\p{Script=Telugu}/u,'Telu','complexScript'], [/\p{Script=Gujarati}/u,'Gujr','complexScript'],
    [/\p{Script=Kannada}/u,'Knda','complexScript'], [/\p{Script=Malayalam}/u,'Mlym','complexScript'],
    [/\p{Script=Khmer}/u,'Khmr','complexScript'], [/\p{Script=Syriac}/u,'Syrc','complexScript'],
  ];
  const result: ReturnType<typeof scriptSegments> = [];
  for (const {segment} of new Intl.Segmenter(undefined, {granularity:'grapheme'}).segment(text)) {
    const match = patterns.find(([pattern])=>pattern.test(segment));
    const previous = result.at(-1);
    const neutral = /^[\p{Script=Common}\p{Script=Inherited}]+$/u.test(segment);
    const script = match?.[1] ?? (neutral ? previous?.script : undefined) ?? 'Latn';
    const kind = match?.[2] ?? (neutral ? previous?.kind : undefined) ?? 'latin';
    if (previous?.script===script) previous.text+=segment;
    else result.push({text:segment,script,kind});
  }
  return result;
}
