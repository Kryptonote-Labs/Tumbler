import type { LosslessXmlElement as Element } from '@tumblerjs/ooxml';
import type { AnimatedProperty, AnimationBehavior, AnimationTrack } from './animation.ts';
import {
  animationChild,
  animationAttribute,
  animationChildren,
  text,
  numeric,
  valueOf,
  startDelay,
  ownDuration,
  trackDuration,
  behaviorTypes,
} from './animation-xml.ts';
const properties = new Map<string, AnimatedProperty>([
  ['ppt_x', 'x'],
  ['ppt_y', 'y'],
  ['ppt_w', 'width'],
  ['ppt_h', 'height'],
  ['ppt_r', 'rotation'],
  ['r', 'rotation'],
  ['style.opacity', 'opacity'],
  ['opacity', 'opacity'],
  ['scaleX', 'scaleX'],
  ['scaleY', 'scaleY'],
]);
export function readAnimationTracks(
  node: Element,
  warn: (message: string) => void,
  offset = 0,
  inheritedDuration?: number,
  inheritedAcceleration = 0,
  inheritedDeceleration = 0,
): AnimationTrack[] {
  const commonBehavior = animationChild(node, 'cBhvr');
  const common = animationChild(commonBehavior ?? node, 'cTn');
  const delay = offset + startDelay(common),
    duration = ownDuration(common) ?? inheritedDuration;
  const acceleration =
    numeric(animationAttribute(common, 'accel'), inheritedAcceleration * 100000) / 100000;
  const deceleration =
    numeric(animationAttribute(common, 'decel'), inheritedDeceleration * 100000) / 100000;
  if (behaviorTypes.has(node.localName)) {
    const target = animationChild(animationChild(commonBehavior, 'tgtEl'), 'spTgt');
    const targetId = animationAttribute(target, 'spid') ?? '';
    const textTarget = animationChild(target, 'txEl');
    const paragraph = animationChild(textTarget, 'pRg');
    const paragraphs = paragraph
      ? ([
          numeric(animationAttribute(paragraph, 'st')),
          numeric(animationAttribute(paragraph, 'end')),
        ] as const)
      : undefined;
    if (animationChildren(target).length)
      warn('Some animation text or graphic targets cannot be played.');
    const attribute = text(animationChildren(animationChild(commonBehavior, 'attrNameLst'))[0]);
    const tracks: AnimationBehavior[] = [];
    const unsupported = () => {
      tracks.push({
        kind: 'unsupported',
        description: `${node.localName}${attribute ? `: ${attribute}` : ''}`,
      });
      warn('Some animation behaviors cannot be played; their timing is retained.');
    };
    if (node.localName === 'set' && attribute === 'style.visibility')
      tracks.push({
        kind: 'visibility',
        visible: valueOf(animationChild(node, 'to')) !== 'hidden',
      });
    else if (node.localName === 'animEffect') {
      const filter = animationAttribute(node, 'filter') ?? '';
      if (
        filter === 'fade' ||
        /^wipe\((left|right|up|down)\)$/.test(filter) ||
        /^barn\((in|out)(Horizontal|Vertical)\)$/.test(filter)
      )
        tracks.push({
          kind: 'filter',
          filter,
          entrance: animationAttribute(node, 'transition') !== 'out',
        });
      else unsupported();
    } else if (node.localName === 'anim') {
      const property = properties.get(attribute);
      if (
        property &&
        (animationAttribute(node, 'calcmode') ?? 'lin') === 'lin' &&
        !animationChildren(animationChild(node, 'tavLst')).some((key) =>
          animationAttribute(key, 'fmla'),
        )
      ) {
        let keys = animationChildren(animationChild(node, 'tavLst')).map((key) => ({
          time: numeric(animationAttribute(key, 'tm')) / 100000,
          value: valueOf(animationChild(key, 'val')),
          ...(animationAttribute(key, 'fmla') ? { formula: animationAttribute(key, 'fmla')! } : {}),
        }));
        if (!keys.length) {
          const from =
            animationAttribute(node, 'from') ??
            (property === 'opacity'
              ? '0'
              : property === 'x'
                ? '#ppt_x'
                : property === 'y'
                  ? '#ppt_y'
                  : property === 'width'
                    ? '#ppt_w'
                    : property === 'height'
                      ? '#ppt_h'
                      : '0');
          const by = animationAttribute(node, 'by');
          keys = [
            { time: 0, value: from },
            {
              time: 1,
              value: animationAttribute(node, 'to') ?? (by ? `(${from})+(${by})` : from),
            },
          ];
        }
        tracks.push({
          kind: 'number',
          property,
          keys,
          additive: animationAttribute(commonBehavior, 'additive') === 'sum',
        });
      } else unsupported();
    } else if (node.localName === 'animRot') {
      const from = Number(animationAttribute(node, 'from') ?? 0) / 60000;
      const to = animationAttribute(node, 'to');
      tracks.push({
        kind: 'number',
        property: 'rotation',
        additive: true,
        keys: [
          { time: 0, value: String(from) },
          {
            time: 1,
            value: String(
              to === undefined
                ? from + Number(animationAttribute(node, 'by') ?? 0) / 60000
                : Number(to) / 60000,
            ),
          },
        ],
      });
    } else if (node.localName === 'animScale') {
      for (const [axis, property] of [
        ['x', 'scaleX'],
        ['y', 'scaleY'],
      ] as const) {
        const from =
          numeric(animationAttribute(animationChild(node, 'from'), axis), 100000) / 100000;
        const to = animationAttribute(animationChild(node, 'to'), axis);
        const by = animationAttribute(animationChild(node, 'by'), axis);
        tracks.push({
          kind: 'number',
          property,
          additive: false,
          keys: [
            { time: 0, value: String(from) },
            {
              time: 1,
              value: String(
                to === undefined
                  ? by === undefined
                    ? 1
                    : Number(by) / 100000
                  : Number(to) / 100000,
              ),
            },
          ],
        });
      }
    } else unsupported();
    const repeatValue = animationAttribute(common, 'repeatCount');
    if (repeatValue === 'indefinite' || animationAttribute(common, 'repeatDur') !== undefined)
      warn('Indefinite or time-limited animation repeats are not supported yet.');
    const metadata = {
      target: targetId,
      ...(paragraphs ? { paragraphs } : {}),
      delay,
      duration: duration ?? (node.localName === 'set' ? 1 : 0),
      acceleration,
      deceleration,
      autoReverse: ['1', 'true'].includes(animationAttribute(common, 'autoRev') ?? ''),
      repeat: repeatValue === undefined ? 1 : numeric(repeatValue, 1000) / 1000,
      hold: ['hold', 'freeze', 'transition'].includes(animationAttribute(common, 'fill') ?? 'hold'),
    };
    return tracks.map((behavior) => ({ ...metadata, behavior }));
  }
  const list = animationChild(common, 'childTnLst');
  const children = list
    ? animationChildren(list)
    : animationChildren(node).filter((child) => child.localName !== 'cTn');
  const output: AnimationTrack[] = [];
  let cursor = 0;
  for (const child of children) {
    const tracks = readAnimationTracks(
      child,
      warn,
      delay + (node.localName === 'seq' ? cursor : 0),
      duration,
      acceleration,
      deceleration,
    );
    output.push(...tracks);
    if (node.localName === 'seq')
      cursor = Math.max(
        cursor,
        ...tracks.map((track) => track.delay + trackDuration(track) - delay),
      );
  }
  return output;
}
