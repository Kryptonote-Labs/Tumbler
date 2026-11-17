import { z } from 'zod';

/** One catalog supplies authoring choices, PowerPoint preset identities and defaults. */
export const ENTRANCE_ANIMATIONS = {
  appear: { label: 'Appear', presetId: 1, duration: 1, directions: [] },
  fade: { label: 'Fade', presetId: 10, duration: 500, directions: [] },
  fly: {
    label: 'Fly In',
    presetId: 2,
    duration: 500,
    directions: [
      'bottom',
      'left',
      'right',
      'top',
      'bottom-left',
      'bottom-right',
      'top-left',
      'top-right',
    ],
  },
  float: { label: 'Float In', presetId: 42, duration: 1000, directions: ['bottom', 'top'] },
  wipe: {
    label: 'Wipe',
    presetId: 22,
    duration: 500,
    directions: ['bottom', 'left', 'right', 'top'],
  },
  split: {
    label: 'Split',
    presetId: 16,
    duration: 500,
    directions: ['horizontal-out', 'horizontal-in', 'vertical-out', 'vertical-in'],
  },
  zoom: { label: 'Zoom', presetId: 23, duration: 500, directions: ['in', 'out'] },
} as const;
export type EntranceAnimationKind = keyof typeof ENTRANCE_ANIMATIONS;
export const entranceAnimationKinds =
  Object.keys(ENTRANCE_ANIMATIONS).filter(isEntranceAnimationKind);
export function isEntranceAnimationKind(value: string): value is EntranceAnimationKind {
  return Object.hasOwn(ENTRANCE_ANIMATIONS, value);
}
export const entranceAnimation = z
  .object({
    kind: z.enum(entranceAnimationKinds),
    start: z.enum(['click', 'with', 'after']).default('click'),
    duration: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    delay: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
    direction: z.string().default(''),
  })
  .strict()
  .superRefine((value, context) => {
    const directions: readonly string[] = ENTRANCE_ANIMATIONS[value.kind].directions;
    if (value.direction && !directions.includes(value.direction))
      context.addIssue({
        code: 'custom',
        path: ['direction'],
        message: 'Choose a direction supported by this entrance.',
      });
  })
  .transform((value) => ({
    ...value,
    duration:
      value.kind === 'appear' ? 1 : (value.duration ?? ENTRANCE_ANIMATIONS[value.kind].duration),
    direction: value.direction || ENTRANCE_ANIMATIONS[value.kind].directions[0] || '',
  }));
export type EntranceAnimationInput = z.input<typeof entranceAnimation>;
export type EntranceAnimation = z.output<typeof entranceAnimation>;
export function normalizeEntranceAnimation(input: EntranceAnimationInput): EntranceAnimation {
  return entranceAnimation.parse(input);
}

export type AnimatedProperty =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'opacity';
export interface AnimationKey {
  readonly time: number;
  readonly value: string;
}
export type AnimationBehavior =
  | {
      readonly kind: 'number';
      readonly property: AnimatedProperty;
      readonly keys: readonly AnimationKey[];
      readonly additive: boolean;
    }
  | { readonly kind: 'visibility'; readonly visible: boolean }
  | { readonly kind: 'filter'; readonly filter: string; readonly entrance: boolean }
  | { readonly kind: 'unsupported'; readonly description: string };
export interface AnimationTrack {
  readonly target: string;
  readonly paragraphs?: readonly [number, number];
  readonly delay: number;
  readonly duration: number;
  readonly acceleration: number;
  readonly deceleration: number;
  readonly autoReverse: boolean;
  readonly repeat: number;
  readonly hold: boolean;
  readonly behavior: AnimationBehavior;
}
/** Compiled cue: timing survives even when one of its visual behaviors is unsupported. */
export interface SlideAnimation {
  readonly id?: string;
  readonly target: string;
  readonly kind: EntranceAnimationKind | 'custom' | 'unsupported';
  readonly entrance: boolean;
  readonly step: number;
  readonly delay: number;
  readonly duration: number;
  readonly direction: string;
  readonly startDelay?: number;
  readonly start?: EntranceAnimation['start'];
  readonly tracks?: readonly AnimationTrack[];
  readonly editable?: boolean;
}
export function animationInput(cue: SlideAnimation): EntranceAnimation | undefined {
  if (!isEntranceAnimationKind(cue.kind) || cue.editable === false || !cue.entrance) return;
  const directions: readonly string[] = ENTRANCE_ANIMATIONS[cue.kind].directions;
  return normalizeEntranceAnimation({
    kind: cue.kind,
    start: cue.start ?? (cue.step ? 'click' : 'with'),
    duration: cue.duration,
    delay: cue.startDelay ?? cue.delay,
    direction: directions.includes(cue.direction) ? cue.direction : '',
  });
}
/** Recompute click groups after an authored change, keeping with/after anchored to the previous cue. */
export function sequenceAnimations(cues: readonly SlideAnimation[]): SlideAnimation[] {
  let step = 0,
    previousStart = 0,
    previousEnd = 0;
  return cues.map((cue) => {
    const start = cue.start ?? (cue.step > step ? 'click' : 'with');
    const ownDelay = cue.startDelay ?? cue.delay;
    let delay: number;
    if (start === 'click') {
      step++;
      delay = ownDelay;
    } else delay = (start === 'after' ? previousEnd : previousStart) + ownDelay;
    previousStart = delay;
    previousEnd = delay + cue.duration;
    return { ...cue, start, step, delay };
  });
}
