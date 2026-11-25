import type { Node } from 'prosemirror-model';
import { ReplaceStep, type Transform } from 'prosemirror-transform';
import { latexIncludeSource } from './latex';

type Include = { node: Node; source: string };

function includeGroups(document: Node) {
  const groups = new Map<string, Include[]>();
  document.descendants(node => {
    if (node.type.name !== 'latex_include') return !node.isTextblock;
    const path: string = node.attrs.path;
    const copies = groups.get(path) ?? [];
    copies.push({ node, source: latexIncludeSource(node) });
    groups.set(path, copies);
    return true;
  });
  return groups;
}

/** Mirror authored changes to the other occurrences as part of the original edit. */
export function syncLatexIncludes(transform: Transform, previous: Node) {
  const current = transform.doc;
  if (current.content === previous.content || !current.attrs.latexProject) return;
  const groups = includeGroups(current);
  if (![...groups.values()].some(copies => copies.some(copy => copy.source !== copies[0]?.source)))
    return;
  const before = includeGroups(previous);
  const sources = new Map<string, Include>();
  for (const [path, copies] of groups) {
    const known = new Set(before.get(path)?.map(copy => copy.source));
    const first = copies[0]!;
    sources.set(path, copies.find(copy => !known.has(copy.source)) ?? first);
  }

  // Keep nested includes linked even when their containing file gets mirrored.
  const active = new Set<string>();
  function synchronized(node: Node): Node {
    if (node.isLeaf || node.isTextblock) return node;
    if (node.type.name !== 'latex_include') return synchronizeChildren(node);

    const path: string = node.attrs.path;
    if (active.has(path)) return node;
    const copy = sources.get(path);
    if (!copy) return node;
    active.add(path);
    const body = synchronizeChildren(copy.source === latexIncludeSource(node) ? node : copy.node);
    active.delete(path);
    return body === node ? node
      : node.type.create({ ...node.attrs, close: body.attrs.close }, body.content, node.marks);
  }

  function synchronizeChildren(node: Node): Node {
    const children = node.children.map(synchronized);
    return children.every((child, index) => child === node.child(index))
      ? node
      : node.type.create(node.attrs, children, node.marks);
  }

  current.descendants((node, position) => {
    if (node.type.name !== 'latex_include') return !node.isTextblock;
    const next = synchronized(node);
    if (!next.eq(node)) mirrorInclude(transform, transform.mapping.map(position), node, next);
    return false;
  });
}

function mirrorInclude(transform: Transform, position: number, before: Node, after: Node) {
  if (before.attrs.close !== after.attrs.close)
    transform.setNodeAttribute(position, 'close', after.attrs.close);
  const from = before.content.findDiffStart(after.content);
  if (from === null) return;
  const end = before.content.findDiffEnd(after.content)!;
  const overlap = Math.max(0, from - Math.min(end.a, end.b));
  const start = position + 1;
  // A minimal step keeps surrounding cursors, history, and collaborative positions mappable.
  const precise = new ReplaceStep(start + from, start + end.a + overlap, after.slice(from, end.b + overlap));
  if (transform.maybeStep(precise).failed)
    transform.replaceWith(start, start + before.content.size, after.content);
}
