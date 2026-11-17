import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import { readAnimationCues } from './animation-reader.ts';
import { animationChild, animationChildren, animationAttribute } from './animation-xml.ts';
import { readSlideTransition } from './transition-reader.ts';
import { isSlideTransitionKind } from './transitions.ts';
export type { SlideAnimation } from './animation.ts';
export type { SlideTransition } from './transitions.ts';

/** Read behaviors and finite main-sequence timing without dropping unsupported durations. */
export function readSlideTiming(root: LosslessXmlElement) {
  const timing = animationChild(root, 'timing');
  const result = readAnimationCues(timing);
  const nodes: LosslessXmlElement[] = [];
  const visit = (node: LosslessXmlElement) => {
    nodes.push(node);
    animationChildren(node).forEach(visit);
  };
  if (timing) visit(timing);
  const main = nodes.some(
    (node) => node.localName === 'cTn' && animationAttribute(node, 'nodeType') === 'mainSeq',
  );
  const unsafe = nodes.some(
    (node) =>
      node.localName === 'tn' ||
      node.localName === 'excl' ||
      ['interactiveSeq', 'clickPar'].includes(animationAttribute(node, 'nodeType') ?? ''),
  );
  const containerRepeats = nodes.some(
    (node) =>
      node.localName === 'cTn' &&
      animationChild(node, 'childTnLst') &&
      ((animationAttribute(node, 'repeatCount') !== undefined &&
        animationAttribute(node, 'repeatCount') !== '1000') ||
        animationAttribute(node, 'repeatDur') !== undefined ||
        ['1', 'true'].includes(animationAttribute(node, 'autoRev') ?? '')),
  );
  const editingRestriction = containerRepeats
    ? 'This slide contains repeated animation containers that are preserved but cannot be edited yet.'
    : unsafe
      ? 'This slide contains interactive timing that is preserved but cannot be edited yet.'
      : timing && result.animations.length && !main
        ? 'This imported timing layout is preserved but cannot be edited yet.'
        : undefined;
  const transition = readSlideTransition(root);
  const warnings = [...result.warnings];
  if (containerRepeats)
    warnings.push('Repeated animation containers are preserved but cannot be played yet.');
  if (transition && !isSlideTransitionKind(transition.kind))
    warnings.push(`Slide transition ${transition.kind} is preserved but cannot be played.`);
  return {
    ...result,
    animations: containerRepeats
      ? result.animations.map((cue) => ({ ...cue, editable: false }))
      : result.animations,
    transition,
    warnings,
    editingRestriction,
  };
}
