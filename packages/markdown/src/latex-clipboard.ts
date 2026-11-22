import {
  DOMParser,
  DOMSerializer,
  Fragment,
  Slice,
  type DOMOutputSpec,
  type Node,
  type Schema,
  type TagParseRule,
} from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { latexAtomPasteRules, latexStructureNodes } from './latex-spec';
import { isLatexProjectPath, readLatexInclude, type LatexProject } from './latex-project';

// HTML carries its ordinary heading/list/emphasis semantics to other editors.
// Preserve the original TeX spelling as well when both sides understand it.
function withDelimiters(spec: DOMOutputSpec, before: unknown, open: unknown, close: unknown) {
  const rendered = DOMSerializer.renderSpec(document, spec);
  rendered.dom.setAttribute('data-latex-delimiters', JSON.stringify([before, open, close]));
  return rendered;
}

function readDelimiters(element: HTMLElement) {
  try {
    const values: unknown = JSON.parse(element.getAttribute('data-latex-delimiters') ?? 'null');
    if (
      Array.isArray(values) &&
      values.length === 3 &&
      values.every((value) => value === null || typeof value === 'string')
    ) {
      const [before, open, close] = values;
      return { before, open, close };
    }
  } catch {
    /* Other applications can modify clipboard HTML. */
  }
  return null;
}

/** Preserve include boundaries in a project and keep copied content readable elsewhere. */
function pasteLatexIncludes(slice: Slice, view: EditorView) {
  let includes = false;
  slice.content.descendants(node => {
    if (node.type.name === 'latex_include') includes = true;
    return !node.isTextblock && !includes;
  });
  if (!includes) return slice;
  const { doc, selection } = view.state;
  const project: LatexProject | null = doc.attrs.latexProject;
  const used = new Set(Object.keys(project?.files ?? {}));
  if (project) used.add(project.entry);
  doc.descendants((node, position) => {
    if (node.type.name === 'latex_include' && (position < selection.from || position + node.nodeSize > selection.to))
      used.add(node.attrs.path);
    return !node.isTextblock;
  });
  function copy(fragment: Fragment): Node[] {
    const result: Node[] = [];
    fragment.forEach(node => {
      if (node.isTextblock || node.isLeaf) {
        result.push(node);
        return;
      }
      const path: string | undefined = node.type.name === 'latex_include' ? node.attrs.path : undefined;
      const retain = path !== undefined && project && !used.has(path);
      if (retain) used.add(path);
      const children = copy(node.content);
      if (path !== undefined && !retain) {
        const first = children[0];
        if (first) children[0] = first.type.create({
          ...first.attrs,
          before: (node.attrs.before ?? '') + (first.attrs.before ?? ''),
        }, first.content, first.marks);
        result.push(...children);
      } else result.push(node.copy(Fragment.fromArray(children)));
    });
    return result;
  }
  const content = Fragment.fromArray(copy(slice.content));
  const max = Slice.maxOpen(content);
  return new Slice(content, Math.min(slice.openStart, max.openStart), Math.min(slice.openEnd, max.openEnd));
}

export function latexClipboard(schema: Schema) {
  const base = DOMSerializer.fromSchema(schema);
  const nodes = { ...base.nodes };
  for (const name of latexStructureNodes) {
    nodes[name] = (node) => {
      const spec = base.nodes[name]!(node);
      const { before, open, close } = node.attrs;
      return before === null && open === null && close === null
        ? spec
        : withDelimiters(spec, before, open, close);
    };
  }
  const marks = {
    ...base.marks,
    latex_style(mark, inline) {
      const { open, close, order } = mark.attrs;
      const rendered = withDelimiters(base.marks.latex_style!(mark, inline), null, open, close);
      rendered.dom.setAttribute('data-latex-order', String(order));
      return rendered;
    },
  } satisfies DOMSerializer['marks'];
  const baseRules = DOMParser.fromSchema(schema).rules;
  const include: TagParseRule = {
    tag: 'div[data-latex-include][data-latex-delimiters]',
    node: 'latex_include',
    getAttrs(element) {
      const path = element.getAttribute('data-latex-include');
      const delimiters = readDelimiters(element);
      const open = delimiters?.open;
      if (!path || !isLatexProjectPath(path) || typeof open !== 'string') return false;
      const reference = readLatexInclude(open, 0);
      return reference?.end === open.length ? { ...delimiters, path } : false;
    },
  };
  const structureRules = baseRules.flatMap((rule): TagParseRule[] => {
    if (!rule.tag || !latexStructureNodes.some((name) => name === rule.node)) return [];
    return [
      {
        ...rule,
        tag: rule.tag + '[data-latex-delimiters]',
        getAttrs: (element) => {
          const delimiters = readDelimiters(element);
          const attrs = rule.getAttrs ? rule.getAttrs(element) : rule.attrs;
          return delimiters && attrs !== false ? { ...attrs, ...delimiters } : false;
        },
      },
    ];
  });
  const style: TagParseRule = {
    tag: 'strong[data-latex-order], em[data-latex-order], span[data-latex-font][data-latex-order], span[data-latex-colour][data-latex-order]',
    mark: 'latex_style',
    getAttrs: (element) => {
      const delimiters = readDelimiters(element);
      const order = Number(element.getAttribute('data-latex-order'));
      if (
        typeof delimiters?.open !== 'string' ||
        typeof delimiters.close !== 'string' ||
        !Number.isSafeInteger(order)
      )
        return false;
      const font = element.getAttribute('data-latex-font');
      const colour = element.getAttribute('data-latex-colour');
      const style = colour && /^#[a-f0-9]{6}$/.test(colour) ? 'colour' : font === 'sans' || font === 'mono' ? font : element.tagName === 'STRONG' ? 'strong' : 'em';
      return {
        open: delimiters.open,
        close: delimiters.close,
        style,
        ...(style === 'colour' ? { colour } : {}),
        order,
      };
    },
  };
  return {
    transformPasted: pasteLatexIncludes,
    clipboardSerializer: new DOMSerializer(nodes, marks),
    clipboardParser: new DOMParser(schema, [
      ...latexAtomPasteRules,
      include,
      ...structureRules,
      style,
      ...baseRules,
    ]),
  };
}
