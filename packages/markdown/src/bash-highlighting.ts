import { common } from 'lowlight';

/** Keep Bash's string/comment rules, adding command names and option flags to ordinary lines. */
export const bashHighlighting: NonNullable<(typeof common)['bash']> = (api) => {
  const base = common.bash!(api);
  const keywords = new Set(
    Object.entries(typeof base.keywords === 'object' ? base.keywords : {})
      .filter(([name]) => name !== '$pattern')
      .flatMap(([, words]) =>
        typeof words === 'string' ? words.split(/\s+/) : Array.isArray(words) ? words : [],
      )
      .map((word) => word.split('|')[0]),
  );
  return {
    ...base,
    contains: [
      ...(base.contains ?? []),
      {
        match: [/(?:^[ \t]*|[;&|][ \t]*)/, /[A-Za-z_./][\w./+-]*(?![\w./+=-])/],
        scope: { 2: 'title' },
        relevance: 0,
        'on:begin': (match, response) => {
          // Keep the original keyword and built-in categories.
          if (keywords.has(match[2])) response.ignoreMatch();
        },
      },
      { match: /(?<!\S)--?[A-Za-z][\w-]*/, scope: 'attr', relevance: 0 },
    ],
  };
};
