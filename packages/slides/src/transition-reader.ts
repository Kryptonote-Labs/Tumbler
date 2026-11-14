import { OOXML_NAMESPACES, type LosslessXmlElement as Element } from '@tumblerjs/ooxml';
import { isSlideTransitionKind, SLIDE_TRANSITIONS, POWERPOINT_2010, POWERPOINT_2012, type SlideTransition } from './transitions.ts';
export const elementChildren = (element: Element) => element.children.filter((node): node is Element => node.kind === 'element');
const MC = OOXML_NAMESPACES.markupCompatibility;
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const attribute = (element: Element | undefined, name: string, namespace = '') => element?.attributes.find(a => a.localName === name && a.namespaceUri === namespace)?.value;

/** Resolve the transition branch without treating an unknown extension as a standard effect. */
export function slideTransitionElement(root: Element): Element | undefined {
  const understood = new Set([root.namespaceUri, POWERPOINT_2010, POWERPOINT_2012, 'http://schemas.microsoft.com/office/powerpoint/2015/09/main']);
  const visit = (parent: Element, inherited: ReadonlyMap<string, string>): Element | undefined => {
    const namespaces = new Map(inherited);
    for (const a of parent.attributes) if (a.namespaceUri === XMLNS) namespaces.set(a.localName, a.value);
    for (const node of elementChildren(parent)) {
      if (node.namespaceUri === root.namespaceUri && node.localName === 'transition') return node;
      if (node.namespaceUri !== MC || node.localName !== 'AlternateContent') continue;
      const branches = elementChildren(node);
      const wrapperNamespaces = new Map(namespaces);
      for (const a of node.attributes) if (a.namespaceUri === XMLNS) wrapperNamespaces.set(a.localName, a.value);
      const branch = branches.find(b => {
        if (b.namespaceUri !== MC || b.localName !== 'Choice') return false;
        const bindings = new Map(wrapperNamespaces);
        for (const a of b.attributes) if (a.namespaceUri === XMLNS) bindings.set(a.localName, a.value);
        const requires = attribute(b, 'Requires')?.trim().split(/\s+/);
        return requires?.length && requires.every(prefix => understood.has(bindings.get(prefix) ?? ''));
      }) ?? branches.find(b => b.namespaceUri === MC && b.localName === 'Fallback');
      if (branch) {
        const found = visit(branch, wrapperNamespaces);
        if (found) return found;
      }
    }
  };
  return visit(root, new Map());
}
const time = (value: string | undefined, fallback: number) => value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
const boolean = (value: string) => value === '1' || value === 'true';
export function readSlideTransition(root: Element): SlideTransition | undefined {
  const transition = slideTransitionElement(root);
  if (!transition) return;
  const effect = elementChildren(transition).find(e => !(e.namespaceUri === root.namespaceUri && ['sndAc', 'extLst'].includes(e.localName)));
  const knownNamespace = effect && [root.namespaceUri, POWERPOINT_2010, POWERPOINT_2012, 'http://schemas.microsoft.com/office/powerpoint/2015/09/main'].includes(effect.namespaceUri);
  const kind = effect?.namespaceUri === POWERPOINT_2012 && effect.localName === 'prstTrans'
    ? attribute(effect, 'prst') ?? 'prstTrans'
    : effect && !knownNamespace ? `{${effect.namespaceUri}}${effect.localName}` : effect?.localName ?? 'cut';
  const importedDirection = attribute(effect, 'dir');
  const direction = (importedDirection === 'horz' || importedDirection === 'vert' ? undefined : importedDirection) ?? (isSlideTransitionKind(kind) ? SLIDE_TRANSITIONS[kind].directions[0] : undefined) ?? 'l';
  const advance = attribute(transition, 'advTm');
  const orientation = attribute(effect, kind === 'split' ? 'orient' : 'dir');
  const spokes = attribute(effect, 'spokes');
  const pattern = attribute(effect, 'pattern');
  const thru = attribute(effect, 'thruBlk');
  const bounce = attribute(effect, 'hasBounce');
  const content = attribute(effect, 'isContent');
  const inverted = attribute(effect, 'isInverted');
  const invertX = attribute(effect, 'invX'), invertY = attribute(effect, 'invY');
  return {
    kind, direction,
    duration: time(attribute(transition, 'dur', POWERPOINT_2010), attribute(transition, 'spd') === 'fast' ? 500 : attribute(transition, 'spd') === 'slow' ? 1000 : 750),
    advanceOnClick: !['0', 'false'].includes(attribute(transition, 'advClick') ?? ''),
    ...(advance === undefined ? {} : { advanceAfter: time(advance, 0) }),
    ...(orientation === 'horz' || orientation === 'vert' ? { orientation } : {}),
    ...(spokes === undefined ? {} : { spokes: Number(spokes) }),
    ...(pattern === undefined ? {} : { pattern }),
    ...(thru === undefined ? {} : { throughBlack: boolean(thru) }),
    ...(bounce === undefined ? {} : { bounce: boolean(bounce) }),
    ...(content === undefined ? {} : { content: boolean(content) }),
    ...(inverted === undefined ? {} : { inverted: boolean(inverted) }),
    ...(invertX === undefined ? {} : { invertX: boolean(invertX) }),
    ...(invertY === undefined ? {} : { invertY: boolean(invertY) }),
  };
}
