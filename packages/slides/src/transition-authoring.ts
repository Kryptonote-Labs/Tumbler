import { beginLosslessXmlEdit, OOXML_NAMESPACES, type LosslessXmlElement } from '@tumblerjs/ooxml';
import type { PresentationArtifact } from './artifact.ts';
import { editable, slideById, raw } from './authoring-slides.ts';
import { commitXml, partXml, xml } from './authoring-xml.ts';
import { elementChildren, slideTransitionElement } from './transition-reader.ts';
import { normalizeSlideTransition, SLIDE_TRANSITIONS, POWERPOINT_2010, POWERPOINT_2012, type SlideTransitionInput } from './transitions.ts';

/** Replace only transition markup. Slide timing, sound actions and other extensions survive edits. */
export function setSlideTransition(artifact: PresentationArtifact, id: string, input: SlideTransitionInput | null) {
  editable(artifact);
  const value = input === null ? null : normalizeSlideTransition(input);
  const slide = slideById(artifact, id), source = partXml(artifact, slide.part);
  const previous = slideTransitionElement(source.root);
  const p = source.root.namespaceUri, mc = OOXML_NAMESPACES.markupCompatibility;
  const top = elementChildren(source.root);
  const isTransition = (node: LosslessXmlElement) => node.namespaceUri === p && node.localName === 'transition';
  const containsTransition = (node: LosslessXmlElement): boolean => isTransition(node) || elementChildren(node).some(containsTransition);
  const containers: LosslessXmlElement[] = [];
  for (const node of top) {
    if (isTransition(node)) containers.push(node);
    else if (node.namespaceUri === mc && node.localName === 'AlternateContent' && containsTransition(node)) {
      const transitions: LosslessXmlElement[] = [];
      const branches = elementChildren(node).flatMap(elementChildren);
      const find = (element: LosslessXmlElement) => {
        if (isTransition(element)) transitions.push(element);
        else for (const child of elementChildren(element)) find(child);
      };
      branches.forEach(find);
      // A mixed AlternateContent can also hold slide timing or content. Keep that structure intact.
      if (branches.every(isTransition)) containers.push(node);
      else containers.push(...transitions);
    }
  }
  const retainedMarkup = (element: LosslessXmlElement) => {
    const declarations = new Map<string, string>();
    for (const ancestor of source.elements()) {
      if (ancestor.span.start > element.span.start || ancestor.span.end < element.span.end) continue;
      for (const attribute of ancestor.attributes)
        if (attribute.qualified === 'xmlns' || attribute.prefix === 'xmlns') declarations.set(attribute.qualified, attribute.value);
    }
    for (const attribute of element.attributes) declarations.delete(attribute.qualified);
    const markup = raw(source, element);
    const offset = element.qualified.length + 1;
    return markup.slice(0, offset) + [...declarations].map(([key, value]) => ` ${key}="${xml(value)}"`).join('') + markup.slice(offset);
  };
  if (value === null && !containers.length) return artifact;
  const edit = beginLosslessXmlEdit(source);
  let markup = '';
  if (value) {
    const kind = input!.kind, definition = SLIDE_TRANSITIONS[kind];
    const attrs: string[] = [];
    const add = (name: string, v: string | number | boolean | undefined) => { if (v !== undefined) attrs.push(`${name}="${typeof v === 'boolean' ? Number(v) : v}"`); };
    if (definition.directions.length) add('dir', value.direction);
    add(kind === 'split' ? 'orient' : 'dir', value.orientation); add('thruBlk', value.throughBlack); add('spokes', value.spokes);
    add('pattern', value.pattern); add('hasBounce', value.bounce); add('isContent', value.content);
    add('isInverted', value.inverted); add('invX', value.invertX); add('invY', value.invertY);
    const effect = definition.family === '2012' ? `<p15:prstTrans prst="${kind}" ${attrs.join(' ')}/>` : `<${definition.family === '2010' ? 'p14' : 'p'}:${kind} ${attrs.join(' ')}/>`;
    const retained = previous ? elementChildren(previous).filter(n => n.namespaceUri === p && ['sndAc', 'extLst'].includes(n.localName)).map(retainedMarkup).join('') : '';
    const advance = `advClick="${Number(value.advanceOnClick)}"${value.advanceAfter === undefined ? '' : ` advTm="${value.advanceAfter}"`}`;
    const speed = value.duration <= 500 ? 'fast' : value.duration >= 1000 ? 'slow' : 'med';
    const transition = `<p:transition spd="${speed}" p14:dur="${value.duration}" ${advance}>${effect}${retained}</p:transition>`;
    // ECMA-376 Part 3 AlternateContent lets older readers use the standard fade fallback.
    const requires = definition.family === '2012' ? 'p14 p15' : 'p14';
    markup = `<mc:AlternateContent xmlns:mc="${mc}" xmlns:p="${p}" xmlns:p14="${POWERPOINT_2010}" xmlns:p15="${POWERPOINT_2012}"><mc:Choice Requires="${requires}">${transition}</mc:Choice><mc:Fallback><p:transition spd="${speed}" ${advance}>${definition.family === 'standard' ? effect : '<p:fade/>'}${retained}</p:transition></mc:Fallback></mc:AlternateContent>`;
  }
  if (containers.length) {
    const mixed = containers.some(node => !top.includes(node));
    containers.forEach((node, i) => edit.replaceElementMarkup(node, mixed || i === 0 ? markup : ''));
  } else if (markup) {
    const after = top.find(node => node.namespaceUri === p && ['timing', 'extLst'].includes(node.localName));
    if (after) edit.insertMarkupBefore(after, markup);
    else edit.appendMarkup(source.root, markup);
  }
  return commitXml(artifact, slide.part, edit.commit().bytes);
}
