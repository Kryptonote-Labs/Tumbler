import { codeToHtml } from 'shiki';

/** Highlight authored examples during prerendering; no highlighter ships to the browser. */
export function highlight(code: string, language = 'TypeScript') {
  const lang = language === 'Svelte' ? 'svelte' : language === 'Terminal' ? 'bash' : language === 'TypeScript' ? 'typescript' : 'text';
  return codeToHtml(code, { lang, theme: 'github-dark' });
}
