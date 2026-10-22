import { parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import type { OpcPackage, OpcPart } from '@tumblerjs/opc';
import { WordError } from './document.ts';

interface NumberingStyle {
  readonly id: string;
  readonly type: string;
  readonly basedOn: string | undefined;
  readonly numId: number | undefined;
}

/** Numbering metadata is separate from the text-format cascade. Style ilvl is ignored. */
export class WordNumberingStyles {
  readonly #styles = new Map<string, NumberingStyle>();
  readonly #cache = new Map<string, { numId: number | undefined; ids: readonly string[] }>();
  #default: string | undefined;

  constructor(root?: LosslessXmlElement, ns = '') {
    if (!root) return;
    const elements = root.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === ns && child.localName === 'style');
    if (elements.length > 100_000) throw new WordError('limit_exceeded', 'Numbering styles exceed 100000 entries.');
    for (const element of elements) {
      const id = attr(element, ns, 'styleId');
      if (id === undefined) throw new WordError('invalid_document', 'Style is missing styleId.');
      if (this.#styles.has(id)) throw new WordError('invalid_document', `Style id ${JSON.stringify(id)} is duplicated.`);
      const type = attr(element, ns, 'type') ?? 'paragraph';
      const pPr = child(element, ns, 'pPr');
      const numPr = pPr && child(pPr, ns, 'numPr');
      const raw = numPr && value(numPr, ns, 'numId');
      if (raw !== undefined && (!/^[0-9]+$/.test(raw) || Number(raw) > 2_147_483_647)) throw new WordError('invalid_document', 'Style numbering instance must be an unsigned 32-bit integer.');
      this.#styles.set(id, { id, type, basedOn: value(element, ns, 'basedOn'), numId: raw === undefined ? undefined : Number(raw) });
      if (type === 'paragraph' && ['1', 'true', 'on'].includes(attr(element, ns, 'default') ?? '')) this.#default = id;
    }
  }

  resolve(styleId: string | undefined, type: 'paragraph' | 'numbering'): { numId: number | undefined; ids: readonly string[] } {
    const selected = styleId !== undefined && this.#styles.get(styleId)?.type === type ? styleId : type === 'paragraph' ? this.#default : undefined;
    if (selected === undefined) return { numId: undefined, ids: [] };
    const cached = this.#cache.get(selected);
    if (cached) return cached;
    const ids: string[] = [];
    const seen = new Set<string>();
    let current: string | undefined = selected;
    let numId: number | undefined;
    while (current !== undefined) {
      if (seen.has(current)) throw new WordError('invalid_document', 'Numbering style has a basedOn cycle.');
      if (ids.length >= 100) throw new WordError('limit_exceeded', 'Numbering style chain exceeds 100 entries.');
      const style = this.#styles.get(current);
      if (!style || style.type !== type) break;
      seen.add(current);
      ids.push(current);
      numId ??= style.numId;
      current = style.basedOn;
    }
    const result = { numId, ids: Object.freeze(ids) };
    this.#cache.set(selected, result);
    return result;
  }
}

export function readNumberingStyles(pkg: OpcPackage, part: OpcPart, relationshipType: string, ns: string): WordNumberingStyles {
  const matches = pkg.relationships(part.name).byType(relationshipType);
  if (matches.length > 1) throw new WordError('invalid_document', 'The Main Document must not have multiple styles relationships.');
  const relationship = matches[0];
  if (!relationship) return new WordNumberingStyles();
  if (relationship.targetMode !== 'Internal') throw new WordError('invalid_document', 'The Styles relationship must target a package part.');
  const target = pkg.getPart(relationship.targetPartName);
  if (target?.contentType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml') throw new WordError('invalid_document', 'The Styles relationship target has the wrong content type.');
  let root: LosslessXmlElement;
  try { root = parseLosslessXml(pkg.readPart(target)).root; }
  catch (cause) { throw new WordError('invalid_document', 'The Styles part is not valid XML.', { cause }); }
  if (root.namespaceUri !== ns || root.localName !== 'styles') throw new WordError('invalid_document', 'The Styles part must have a WordprocessingML styles root.');
  return new WordNumberingStyles(root, ns);
}

function attr(element: LosslessXmlElement, ns: string, name: string): string | undefined {
  return element.attributes.find(item => item.namespaceUri === ns && item.localName === name)?.value;
}
function child(element: LosslessXmlElement, ns: string, name: string): LosslessXmlElement | undefined {
  const children = element.children.filter((item): item is LosslessXmlElement => item.kind === 'element' && item.namespaceUri === ns && item.localName === name);
  if (children.length > 1) throw new WordError('invalid_document', `${element.localName} must not repeat ${name}.`);
  return children[0];
}
function value(element: LosslessXmlElement, ns: string, name: string): string | undefined {
  const node = child(element, ns, name);
  return node && attr(node, ns, 'val');
}
