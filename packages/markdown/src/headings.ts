import type { Node } from 'prosemirror-model';

/** Markdown heading fragments, including deterministic suffixes for duplicate titles. */
export function noteHeadings(document: Node) {
  const used = new Set<string>();
  const headings: { text: string; slug: string; pos: number }[] = [];
  document.descendants((node, pos) => {
    if (node.type.name !== 'heading') return;
    const text = node.textContent;
    const base =
      text
        .normalize('NFC')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, '')
        .replace(/\s/g, '-') || 'section';
    let slug = base;
    for (let suffix = 1; used.has(slug); suffix++) slug = `${base}-${suffix}`;
    used.add(slug);
    headings.push({ text, slug, pos });
    return false;
  });
  return headings;
}
