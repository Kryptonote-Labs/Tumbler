import { z } from 'zod';

export const POWERPOINT_2010 = 'http://schemas.microsoft.com/office/powerpoint/2010/main';
export const POWERPOINT_2012 = 'http://schemas.microsoft.com/office/powerpoint/2012/main';
const side = ['l', 'r', 'u', 'd'] as const;
const eight = [...side, 'lu', 'ru', 'ld', 'rd'] as const;
const horizontal = ['l', 'r'] as const;
const inOut = ['out', 'in'] as const;

/** ECMA-376 §19.5 transitions and MS-PPTX §2.2.1/§2.4.3.8 extensions. Morph is preserved on import only. */
export const SLIDE_TRANSITIONS = {
  cut: { label: 'Cut', family: 'standard', directions: [] },
  fade: { label: 'Fade', family: 'standard', directions: [] },
  push: { label: 'Push', family: 'standard', directions: side },
  wipe: { label: 'Wipe', family: 'standard', directions: side },
  cover: { label: 'Cover', family: 'standard', directions: eight },
  pull: { label: 'Uncover', family: 'standard', directions: eight },
  split: { label: 'Split', family: 'standard', directions: inOut },
  blinds: { label: 'Blinds', family: 'standard', directions: [] },
  checker: { label: 'Checkerboard', family: 'standard', directions: [] },
  circle: { label: 'Circle', family: 'standard', directions: [] },
  diamond: { label: 'Diamond', family: 'standard', directions: [] },
  plus: { label: 'Plus', family: 'standard', directions: [] },
  dissolve: { label: 'Dissolve', family: 'standard', directions: [] },
  comb: { label: 'Comb', family: 'standard', directions: [] },
  newsflash: { label: 'Newsflash', family: 'standard', directions: [] },
  random: { label: 'Random', family: 'standard', directions: [] },
  randomBar: { label: 'Random bars', family: 'standard', directions: [] },
  strips: { label: 'Strips', family: 'standard', directions: ['lu', 'ru', 'ld', 'rd'] },
  wedge: { label: 'Wedge', family: 'standard', directions: [] },
  wheel: { label: 'Wheel', family: 'standard', directions: [] },
  zoom: { label: 'Box', family: 'standard', directions: inOut },
  vortex: { label: 'Vortex', family: '2010', directions: side },
  switch: { label: 'Switch', family: '2010', directions: horizontal },
  flip: { label: 'Flip', family: '2010', directions: horizontal },
  ripple: { label: 'Ripple', family: '2010', directions: ['center', 'lu', 'ru', 'ld', 'rd'] },
  honeycomb: { label: 'Honeycomb', family: '2010', directions: [] },
  prism: { label: 'Prism', family: '2010', directions: side },
  doors: { label: 'Doors', family: '2010', directions: [] },
  window: { label: 'Window', family: '2010', directions: [] },
  ferris: { label: 'Ferris wheel', family: '2010', directions: horizontal },
  gallery: { label: 'Gallery', family: '2010', directions: horizontal },
  conveyor: { label: 'Conveyor', family: '2010', directions: horizontal },
  pan: { label: 'Pan', family: '2010', directions: side },
  glitter: { label: 'Glitter', family: '2010', directions: side },
  warp: { label: 'Warp', family: '2010', directions: inOut },
  flythrough: { label: 'Fly through', family: '2010', directions: inOut },
  flash: { label: 'Flash', family: '2010', directions: [] },
  shred: { label: 'Shred', family: '2010', directions: inOut },
  reveal: { label: 'Reveal', family: '2010', directions: horizontal },
  wheelReverse: { label: 'Reverse wheel', family: '2010', directions: [] },
  fallOver: { label: 'Fall over', family: '2012', directions: [] },
  drape: { label: 'Drape', family: '2012', directions: [] },
  curtains: { label: 'Curtains', family: '2012', directions: [] },
  wind: { label: 'Wind', family: '2012', directions: [] },
  prestige: { label: 'Prestige', family: '2012', directions: [] },
  fracture: { label: 'Fracture', family: '2012', directions: [] },
  crush: { label: 'Crush', family: '2012', directions: [] },
  peelOff: { label: 'Peel off', family: '2012', directions: [] },
  pageCurlDouble: { label: 'Page curl, double', family: '2012', directions: [] },
  pageCurlSingle: { label: 'Page curl, single', family: '2012', directions: [] },
  airplane: { label: 'Airplane', family: '2012', directions: [] },
  origami: { label: 'Origami', family: '2012', directions: [] },
} as const;
export type SlideTransitionKind = keyof typeof SLIDE_TRANSITIONS;
export function isSlideTransitionKind(kind: string): kind is SlideTransitionKind {
  return Object.hasOwn(SLIDE_TRANSITIONS, kind);
}
export const slideTransitionKinds = Object.keys(SLIDE_TRANSITIONS).filter(isSlideTransitionKind);
export const ORIENTED_TRANSITIONS = ['split', 'blinds', 'checker', 'comb', 'randomBar', 'doors', 'window'] as const;
export const TRANSITION_DIRECTIONS = ['l', 'r', 'u', 'd', 'lu', 'ru', 'ld', 'rd', 'in', 'out', 'center'] as const;
// advTm is xsd:unsignedInt. p14:dur is an unsigned millisecond string. Do not impose UI-only duration caps.
export const slideTransition = z.object({
  kind: z.enum(slideTransitionKinds),
  direction: z.enum(TRANSITION_DIRECTIONS).optional(),
  duration: z.number().finite().nonnegative().safe().optional(),
  advanceAfter: z.number().int().min(0).max(4294967295).optional(),
  advanceOnClick: z.boolean().optional(),
  orientation: z.enum(['horz', 'vert']).optional(),
  throughBlack: z.boolean().optional(),
  spokes: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(8)]).optional(),
  pattern: z.enum(['diamond', 'hexagon', 'strip', 'rectangle']).optional(),
  bounce: z.boolean().optional(),
  content: z.boolean().optional(),
  inverted: z.boolean().optional(),
  invertX: z.boolean().optional(),
  invertY: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  const definition = SLIDE_TRANSITIONS[value.kind];
  const issue = (key: string) => ctx.addIssue({ code: 'custom', path: [key], message: `Invalid ${key} for ${value.kind}.` });
  if (value.direction && !(definition.directions as readonly string[]).includes(value.direction)) issue('direction');
  if (value.orientation !== undefined && !(ORIENTED_TRANSITIONS as readonly string[]).includes(value.kind)) issue('orientation');
  if (value.throughBlack !== undefined && !['cut', 'fade', 'reveal'].includes(value.kind)) issue('throughBlack');
  if (value.spokes !== undefined && !['wheel', 'wheelReverse'].includes(value.kind)) issue('spokes');
  if (value.pattern !== undefined && !(value.kind === 'glitter' ? ['diamond', 'hexagon'] : value.kind === 'shred' ? ['strip', 'rectangle'] : []).includes(value.pattern)) issue('pattern');
  if (value.bounce !== undefined && value.kind !== 'flythrough') issue('bounce');
  if (value.content !== undefined && value.kind !== 'prism') issue('content');
  if (value.inverted !== undefined && value.kind !== 'prism') issue('inverted');
  if ((value.invertX !== undefined || value.invertY !== undefined) && definition.family !== '2012') issue('invertX');
});
export type SlideTransitionInput = z.input<typeof slideTransition>;

/** Imported unknown effects remain addressable and are preserved by the package engine. */
export interface SlideTransition {
  readonly kind: string;
  readonly direction: string;
  readonly duration: number;
  readonly advanceAfter?: number | undefined;
  readonly advanceOnClick: boolean;
  readonly orientation?: 'horz' | 'vert' | undefined;
  readonly throughBlack?: boolean | undefined;
  readonly spokes?: number | undefined;
  readonly pattern?: string | undefined;
  readonly bounce?: boolean | undefined;
  readonly content?: boolean | undefined;
  readonly inverted?: boolean | undefined;
  readonly invertX?: boolean | undefined;
  readonly invertY?: boolean | undefined;
}
export function normalizeSlideTransition(input: SlideTransitionInput): SlideTransition {
  const value = slideTransition.parse(input);
  return { ...value, duration: value.duration ?? 750, advanceOnClick: value.advanceOnClick ?? true, direction: value.direction ?? SLIDE_TRANSITIONS[value.kind].directions[0] ?? 'l' };
}
