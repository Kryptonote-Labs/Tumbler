import { codeToHtml } from 'shiki';

// vitesse-dark punctuation, quotes and comments fall below 4.5:1 on our code background.
const colorReplacements = { '#666666': '#8a978c', '#c98a7d77': '#c98a7d', '#758575dd': '#8f9e8f' };

/** Highlight authored examples during prerendering; no highlighter ships to the browser. */
export function highlight(code: string, language = 'TypeScript') {
  const lang = language === 'Svelte' ? 'svelte' : language === 'Terminal' ? 'bash' : language === 'TypeScript' ? 'typescript' : 'text';
  return codeToHtml(code, { lang, theme: 'vitesse-dark', colorReplacements });
}
