import type { LosslessXmlElement as Element } from '@tumblerjs/ooxml';
import type { AnimationTrack } from './animation.ts';
export const animationChildren = (element: Element | undefined): Element[] =>
  element?.children.filter(
    (node): node is Element =>
      node.kind === 'element' && node.namespaceUri === element.namespaceUri,
  ) ?? [];
export const animationChild = (element: Element | undefined, name: string) =>
  animationChildren(element).find((node) => node.localName === name);
export const animationAttribute = (element: Element | undefined, name: string) =>
  element?.attributes.find((attribute) => attribute.localName === name && !attribute.namespaceUri)
    ?.value;
const text = (element: Element | undefined) =>
  element?.children.flatMap((n) => (n.kind === 'text' ? [n.value] : [])).join('') ?? '';
const numeric = (value: string | undefined, fallback = 0) =>
  value !== undefined && /^\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value))
    ? Number(value)
    : fallback;
const valueOf = (element: Element | undefined) => {
  const value = animationChildren(element)[0];
  return animationAttribute(value, 'val') ?? '';
};
const behaviorTypes = new Set([
  'anim',
  'animEffect',
  'animRot',
  'animScale',
  'animMotion',
  'animClr',
  'set',
  'cmd',
  'audio',
  'video',
]);
export function animationTimingIdCeiling(root: Element): number {
  let ceiling = 0;
  const visit = (node: Element) => {
    if (node.localName === 'cTn')
      ceiling = Math.max(ceiling, numeric(animationAttribute(node, 'id')));
    animationChildren(node).forEach(visit);
  };
  visit(root);
  return ceiling;
}
function startDelay(common: Element | undefined) {
  return Math.max(
    0,
    ...animationChildren(animationChild(common, 'stCondLst')).map((condition) =>
      numeric(animationAttribute(condition, 'delay')),
    ),
  );
}
function ownDuration(common: Element | undefined) {
  const value = animationAttribute(common, 'dur');
  return value === undefined || value === 'indefinite' ? undefined : numeric(value);
}
function trackDuration(track: AnimationTrack) {
  return track.duration * track.repeat * (track.autoReverse ? 2 : 1);
}

export { text, numeric, valueOf, startDelay, ownDuration, trackDuration, behaviorTypes };
