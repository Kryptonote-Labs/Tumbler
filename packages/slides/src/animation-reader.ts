import type { LosslessXmlElement as Element } from '@tumblerjs/ooxml';
import { ENTRANCE_ANIMATIONS, entranceAnimationKinds, type SlideAnimation } from './animation.ts';
import {
  animationChild,
  animationAttribute,
  animationChildren,
  numeric,
  startDelay,
  ownDuration,
  trackDuration,
  behaviorTypes,
} from './animation-xml.ts';
import { readAnimationTracks } from './animation-behavior-reader.ts';
const effectTypes = new Set(['clickEffect', 'withEffect', 'afterEffect']);
/** Lower timing containers to finite main-sequence cues. Unknown visuals retain their time. */
export function readAnimationCues(timing: Element | undefined) {
  const cues: SlideAnimation[] = [],
    warnings = new Set<string>();
  let step = 0,
    previousStart = 0,
    previousEnd = 0;
  const warn = (message: string) => warnings.add(message);
  function visit(node: Element, inheritedDelay = 0, explicitGroup = false) {
    const common = animationChild(node, 'cTn');
    const type = animationAttribute(common, 'nodeType');
    if (type === 'interactiveSeq') {
      warn('Interactive animation triggers are preserved but cannot be played yet.');
      return;
    }
    if (
      explicitGroup &&
      !type &&
      animationChildren(animationChild(common, 'stCondLst')).some(
        (condition) => animationAttribute(condition, 'delay') === 'indefinite',
      )
    ) {
      step++;
      previousStart = 0;
      previousEnd = 0;
    }
    if ((type && effectTypes.has(type)) || behaviorTypes.has(node.localName)) {
      const tracks = readAnimationTracks(node, warn, -startDelay(common));
      const start = type === 'clickEffect' ? 'click' : type === 'afterEffect' ? 'after' : 'with';
      const ownDelay = startDelay(common) + inheritedDelay;
      if (start === 'click' && !explicitGroup) {
        step++;
        previousStart = 0;
        previousEnd = 0;
      }
      const delay =
        ownDelay +
        (explicitGroup
          ? 0
          : start === 'after'
            ? previousEnd
            : start === 'with'
              ? previousStart
              : 0);
      const localTracks = tracks;
      const duration =
        ownDuration(common) ??
        Math.max(0, ...localTracks.map((track) => track.delay + trackDuration(track)));
      const presetId = numeric(animationAttribute(common, 'presetID'), -1);
      const presetClass = animationAttribute(common, 'presetClass');
      const entrance =
        presetClass === 'entr' ||
        (presetClass === undefined &&
          tracks.some(
            (track) =>
              (track.behavior.kind === 'filter' && track.behavior.entrance) ||
              (track.behavior.kind === 'visibility' && track.behavior.visible),
          ));
      let kind: SlideAnimation['kind'] =
        entranceAnimationKinds.find((kind) => ENTRANCE_ANIMATIONS[kind].presetId === presetId) ??
        'custom';
      const filter = tracks.find((track) => track.behavior.kind === 'filter')?.behavior;
      if (kind === 'custom') {
        if (filter?.kind === 'filter' && filter.filter === 'fade') kind = 'fade';
        else if (filter?.kind === 'filter' && filter.filter.startsWith('wipe(')) kind = 'wipe';
        else if (tracks.length && tracks.every((track) => track.behavior.kind === 'visibility'))
          kind = 'appear';
        else if (!tracks.length || tracks.every((track) => track.behavior.kind === 'unsupported'))
          kind = 'unsupported';
      }
      const subtype = numeric(animationAttribute(common, 'presetSubtype'));
      let direction = '';
      if (kind === 'fly')
        direction =
          new Map([
            [1, 'top'],
            [2, 'right'],
            [4, 'bottom'],
            [8, 'left'],
            [3, 'top-right'],
            [6, 'bottom-right'],
            [9, 'top-left'],
            [12, 'bottom-left'],
          ]).get(subtype) ?? 'bottom';
      if (kind === 'float') direction = subtype === 1 ? 'top' : 'bottom';
      if (kind === 'zoom') direction = subtype === 32 ? 'out' : 'in';
      if (kind === 'wipe' && filter?.kind === 'filter')
        direction =
          new Map([
            ['wipe(up)', 'bottom'],
            ['wipe(down)', 'top'],
            ['wipe(left)', 'right'],
            ['wipe(right)', 'left'],
          ]).get(filter.filter) ?? 'bottom';
      if (kind === 'split' && filter?.kind === 'filter')
        direction = `${filter.filter.includes('Horizontal') ? 'horizontal' : 'vertical'}-${filter.filter.startsWith('barn(in') ? 'in' : 'out'}`;
      const events = animationChildren(animationChild(common, 'stCondLst')).filter((condition) =>
        animationAttribute(condition, 'evt'),
      );
      const interactive = events.some(
        (condition) =>
          !['onBegin', 'onEnd', 'onNext'].includes(animationAttribute(condition, 'evt')!),
      );
      if (interactive)
        warn('Interactive animation triggers are preserved but cannot be played yet.');
      const target = tracks.find((track) => track.target)?.target ?? '';
      cues.push({
        id: animationAttribute(common, 'id') ?? `effect-${cues.length}`,
        target,
        kind,
        entrance,
        step,
        delay,
        duration,
        direction,
        start,
        tracks: localTracks,
        editable:
          !interactive &&
          entrance &&
          tracks.every(
            (track) =>
              track.target === target && !track.paragraphs && track.behavior.kind !== 'unsupported',
          ) &&
          kind !== 'custom' &&
          kind !== 'unsupported',
        startDelay: explicitGroup
          ? Math.max(
              0,
              delay - (start === 'after' ? previousEnd : start === 'with' ? previousStart : 0),
            )
          : ownDelay,
      });
      previousStart = delay;
      previousEnd = delay + duration;
      return;
    }
    const list = animationChild(common, 'childTnLst');
    if (list)
      for (const child of animationChildren(list))
        visit(child, inheritedDelay + startDelay(common), explicitGroup || type === 'mainSeq');
    else
      for (const child of animationChildren(node))
        if (child.localName !== 'cTn') visit(child, inheritedDelay, explicitGroup);
  }
  if (timing) visit(timing);
  return { animations: cues, warnings: [...warnings] };
}
