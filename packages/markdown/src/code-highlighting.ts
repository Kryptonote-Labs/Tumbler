import { common, createLowlight } from 'lowlight';
import type { Node } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { bashHighlighting } from './bash-highlighting';

const highlighter = createLowlight({ ...common, bash: bashHighlighting });
const aliases: Readonly<Record<string, string>> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shellscript: 'bash',
  html: 'xml',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  rs: 'rust',
  yml: 'yaml',
  text: '',
  txt: '',
  plain: '',
  plaintext: '',
};
const labels: Readonly<Record<string, string>> = {
  arduino: 'Arduino',
  bash: 'Bash',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  diff: 'Diff',
  go: 'Go',
  graphql: 'GraphQL',
  ini: 'INI',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  kotlin: 'Kotlin',
  less: 'Less',
  lua: 'Lua',
  makefile: 'Makefile',
  markdown: 'Markdown',
  objectivec: 'Objective-C',
  perl: 'Perl',
  php: 'PHP',
  'php-template': 'PHP template',
  python: 'Python',
  'python-repl': 'Python REPL',
  r: 'R',
  ruby: 'Ruby',
  rust: 'Rust',
  scss: 'SCSS',
  shell: 'Shell session',
  sql: 'SQL',
  swift: 'Swift',
  typescript: 'TypeScript',
  vbnet: 'Visual Basic',
  wasm: 'WebAssembly',
  xml: 'HTML / XML',
  yaml: 'YAML',
};
export function noteCodeLanguage(params: string): string {
  const language = params.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return aliases[language] ?? language;
}
export const noteCodeLanguages = [
  { value: '', label: 'Plain text' },
  ...highlighter
    .listLanguages()
    .filter((value) => value !== 'plaintext')
    .map((value) => ({ value, label: labels[value] ?? value }))
    .sort((a, b) => a.label.localeCompare(b.label)),
];
type Token = ReturnType<typeof highlighter.highlight>['children'][number];
type Span = { from: number; to: number; classes: string };

/** Highlighting is a view decoration. It never rewrites code, Markdown, or collaborative steps. */
export function noteCodeHighlighting() {
  // ProseMirror nodes are immutable. Unchanged blocks reuse their tokens as other text is edited.
  const cache = new WeakMap<Node, readonly Span[]>();
  function tokens(node: Node) {
    const previous = cache.get(node);
    if (previous) return previous;
    const spans: Span[] = [];
    const language = noteCodeLanguage(node.attrs.params);
    if (language && node.textContent && highlighter.registered(language)) {
      let offset = 0;
      const walk = (children: readonly Token[], inherited: readonly string[]) => {
        for (const child of children) {
          if (child.type === 'text') {
            if (child.value.length && inherited.length)
              spans.push({
                from: offset,
                to: offset + child.value.length,
                classes: [...new Set(inherited)].join(' '),
              });
            offset += child.value.length;
          } else if (child.type === 'element') {
            const classes = child.properties.className;
            walk(
              child.children,
              Array.isArray(classes) ? [...inherited, ...classes.map(String)] : inherited,
            );
          }
        }
      };
      walk(highlighter.highlight(language, node.textContent).children, []);
    }
    cache.set(node, spans);
    return spans;
  }
  function decorations(document: Node) {
    const decorations: Decoration[] = [];
    document.descendants((node, pos) => {
      if (node.type.name !== 'code_block') return;
      for (const span of tokens(node))
        decorations.push(
          Decoration.inline(pos + 1 + span.from, pos + 1 + span.to, { class: span.classes }),
        );
      return false;
    });
    return DecorationSet.create(document, decorations);
  }
  return new Plugin<DecorationSet>({
    state: {
      init: (_config, state) => decorations(state.doc),
      apply: (transaction, current) => {
        if (!transaction.docChanged) return current;
        const start = transaction.before.content.findDiffStart(transaction.doc.content);
        if (start === null) return current;
        const end = transaction.before.content.findDiffEnd(transaction.doc.content)?.b ?? start;
        let next = current.map(transaction.mapping, transaction.doc);
        const ranges = [{ from: start, to: Math.max(start, end) }];
        // Document replacements can retain code outside the final content diff.
        // Its mapped decorations still need restoring after the replacement removes them.
        transaction.mapping.maps.forEach((map, index) => {
          const rest = transaction.mapping.slice(index + 1);
          map.forEach((_oldFrom, _oldTo, from, to) => {
            ranges.push({ from: rest.map(from, -1), to: rest.map(to, 1) });
          });
        });
        const visited = new Set<number>();
        for (const range of ranges)
          transaction.doc.nodesBetween(
            Math.max(0, range.from - 1),
            Math.min(transaction.doc.content.size, range.to + 1),
            (node, pos) => {
              if (!node.isTextblock) return;
              if (visited.has(pos)) return false;
              visited.add(pos);
              next = next.remove(next.find(pos, pos + node.nodeSize));
              if (node.type.name === 'code_block')
                next = next.add(
                  transaction.doc,
                  tokens(node).map((span) =>
                    Decoration.inline(pos + 1 + span.from, pos + 1 + span.to, {
                      class: span.classes,
                    }),
                  ),
                );
              return false;
            },
          );
        return next;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
