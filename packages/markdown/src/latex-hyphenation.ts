import { exceptions, patterns } from './latex-english-patterns';

type Pattern = { children: Map<string, Pattern>; scores?: number[] };

function addPattern(root: Pattern, token: string) {
  const scores: number[] = [];
  let index = 0;
  let node = root;
  for (const char of token) {
    const score = Number(char);
    if (Number.isInteger(score)) {
      scores[index] = score;
      continue;
    }
    let child = node.children.get(char);
    if (!child) node.children.set(char, (child = { children: new Map() }));
    node = child;
    index++;
  }
  node.scores = scores;
}

let english: Pattern | undefined;
const englishExceptions = new Map(
  exceptions
    .trim()
    .split(/\s+/)
    .map((entry) => {
      let offset = 0;
      const cuts = entry
        .split('-')
        .slice(0, -1)
        .map((part) => (offset += part.length));
      return [entry.replaceAll('-', ''), cuts] as const;
    }),
);

/** Plain TeX's default US English patterns with two left and three right characters kept. */
export function hyphenateLatexEnglish(word: string) {
  if (!/^[A-Za-z]{5,}$/.test(word) || /^[A-Z]/.test(word)) return [];
  const lower = word.toLowerCase();
  const exception = englishExceptions.get(lower);
  if (exception) return exception;
  if (!english) {
    english = { children: new Map() };
    for (const token of patterns.trim().split(/\s+/)) addPattern(english, token);
  }
  const padded = '.' + lower + '.';
  const scores = new Uint8Array(padded.length + 1);
  for (let start = 0; start < padded.length; start++) {
    let match: Pattern | undefined = english;
    for (let next = start; next < padded.length && match; next++) {
      match = match.children.get(padded[next]!);
      match?.scores?.forEach((score, offset) => {
        const at = start + offset;
        scores[at] = Math.max(scores[at] ?? 0, score);
      });
    }
  }
  const breaks: number[] = [];
  for (let at = 2; at <= word.length - 3; at++) if (scores[at + 1]! % 2) breaks.push(at);
  return breaks;
}
