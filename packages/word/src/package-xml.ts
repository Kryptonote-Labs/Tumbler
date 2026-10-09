import type { LosslessXmlElement, LosslessXmlNode } from '@tumblerjs/ooxml';
import type { WordDocument } from './document.ts';
import { xml } from './create-xml.ts';

/** Source-aware XML construction. Original namespace bindings travel with moved fragments. */
export class PackageXml {
  readonly parents = new Map<number, LosslessXmlElement>();
  constructor(readonly document: WordDocument) {
    for (const parent of document.source.elements())
      for (const child of parent.children) this.parents.set(child.id, parent);
  }
  element(id: number | undefined, name?: string) {
    const element = id === undefined ? undefined : this.document.source.element(id);
    if (id !== undefined && (!element || (name && element.localName !== name)))
      throw new Error('Invalid source content reference.');
    return element;
  }
  raw(node: LosslessXmlNode) {
    return this.document.source.source.slice(node.span.start, node.span.end);
  }
  children(element: LosslessXmlElement | undefined, name?: string) {
    return (
      element?.children.filter(
        (node): node is LosslessXmlElement =>
          node.kind === 'element' &&
          (name === undefined ||
            (node.localName === name && node.namespaceUri === element.namespaceUri)),
      ) ?? []
    );
  }
  wrap(element: LosslessXmlElement | undefined, name: string, content: string) {
    if (!element)
      return `<w:${name} xmlns:w="${this.document.source.root.namespaceUri}">${content}</w:${name}>`;
    const bindings = new Map<string, string>();
    let parent = this.parents.get(element.id);
    while (parent) {
      for (const attribute of parent.attributes)
        if (
          (attribute.prefix === 'xmlns' || attribute.qualified === 'xmlns') &&
          !bindings.has(attribute.qualified)
        )
          bindings.set(attribute.qualified, attribute.value);
      parent = this.parents.get(parent.id);
    }
    const missing = [...bindings].filter(
      ([name]) => !element.attributes.some((attr) => attr.qualified === name),
    );
    const opening = this.document.source.source
      .slice(element.startTagSpan.start, element.startTagSpan.end)
      .replace(
        /\s*\/?>$/,
        `${missing.map(([name, value]) => ` ${name}="${xml(value)}"`).join('')}>`,
      );
    return `${opening}${content}</${element.qualified}>`;
  }
  /** Opaque children stay anchored before their next surviving source child. */
  container(
    element: LosslessXmlElement | undefined,
    name: string,
    names: readonly string[],
    content: string | readonly { source?: number; markup: string }[],
  ) {
    if (typeof content === 'string') content = [{ markup: content }];
    if (!element)
      return this.wrap(undefined, name, content.map((item) => item.markup).join(''));
    const children = element.children;
    const isContent = (node: LosslessXmlNode) =>
      node.kind === 'element' &&
      node.namespaceUri === element.namespaceUri &&
      names.includes(node.localName);
    const anchors = new Map<number | undefined, string[]>();
    const present = new Set(
      content.map((item) => item.source).filter((id) => id !== undefined),
    );
    const firstContent = children.findIndex(isContent);
    let leading = '';
    for (const [index, node] of children.entries()) {
      if (isContent(node)) continue;
      if (firstContent >= 0 && index < firstContent) {
        leading += this.raw(node);
        continue;
      }
      const next = children
        .slice(index + 1)
        .find((child) => isContent(child) && present.has(child.id));
      const key = next?.id;
      const values = anchors.get(key) ?? [];
      values.push(this.raw(node));
      anchors.set(key, values);
    }
    const joined =
      content
        .map((item) => {
          const prefix =
            item.source === undefined ? '' : (anchors.get(item.source) ?? []).join('');
          if (item.source !== undefined) anchors.delete(item.source);
          return prefix + item.markup;
        })
        .join('') + (anchors.get(undefined) ?? []).join('');
    return this.wrap(element, name, leading + joined);
  }
  word(content: string) {
    return content.replace(
      /<w:([\w]+)(?=[\s/>])(?![^>]*\bxmlns:w=)/g,
      `$& xmlns:w="${this.document.source.root.namespaceUri}"`,
    );
  }
  properties(
    element: LosslessXmlElement | undefined,
    name: string,
    replacements: ReadonlyMap<string, string>,
  ) {
    if (!replacements.size) return element ? this.raw(element) : '';
    const order = propertyOrder[name] ?? [];
    const parts =
      element?.children
        .filter(
          (node) =>
            node.kind !== 'element' ||
            node.namespaceUri !== element.namespaceUri ||
            !replacements.has(node.localName),
        )
        .map((node) => ({
          name: node.kind === 'element' ? node.localName : '',
          markup: this.raw(node),
        })) ?? [];
    for (const [key, value] of replacements) {
      if (!value) continue;
      const rank = order.indexOf(key);
      const next = rank < 0 ? -1 : parts.findIndex((part) => order.indexOf(part.name) > rank);
      parts.splice(next < 0 ? parts.length : next, 0, {
        name: key,
        markup: this.word(value),
      });
    }
    const content = parts.map((part) => part.markup).join('');
    return content ? this.wrap(element, name, content) : '';
  }
}

// CT_RPr, CT_PPr and CT_TcPr child order in WordprocessingML.
const propertyOrder: Record<string, readonly string[]> = {
  tblPr:
    'tblStyle tblpPr tblOverlap bidiVisual tblStyleRowBandSize tblStyleColBandSize tblW jc tblCellSpacing tblInd tblBorders shd tblLayout tblCellMar tblLook tblCaption tblDescription tblPrChange'.split(
      ' ',
    ),
  tcBorders: 'top left bottom right insideH insideV tl2br tr2bl'.split(' '),
  trPr: 'cnfStyle divId gridBefore gridAfter wBefore wAfter cantSplit trHeight tblHeader tblCellSpacing jc hidden ins del trPrChange'.split(
    ' ',
  ),
  rPr: 'rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em lang eastAsianLayout specVanish oMath rPrChange'.split(
    ' ',
  ),
  pPr: 'pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange'.split(
    ' ',
  ),
  tcPr: 'cnfStyle tcW gridSpan hMerge vMerge tcBorders shd noWrap tcMar textDirection tcFitText vAlign hideMark headers cellIns cellDel cellMerge tcPrChange'.split(
    ' ',
  ),
};
