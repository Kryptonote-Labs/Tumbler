import { isSlideTransitionKind, type SlideTransition, type SlideTransitionKind } from '@tumblerjs/slides';
import { clamp, noise, rectangle, polygon, transitionMask } from './presentation-transition-masks.ts';
export interface TransitionVisual {
  transform?: string;
  opacity?: number;
  filter?: string;
  origin?: string;
  mask?: string;
}
export interface TransitionPiece {
  clip: string;
  visual: TransitionVisual;
  reflection?: string;
}
export interface TransitionFrame {
  incoming: TransitionVisual;
  outgoing: TransitionVisual;
  front: 'incoming' | 'outgoing';
  pieces?: TransitionPiece[];
  background?: string;
  reflectMask?: string;
}
const move = (x: number, y: number) => `translate(${x * 100}%, ${y * 100}%)`;
function vector(direction: string): [number, number] {
  return [direction.includes('l') ? -1 : direction.includes('r') ? 1 : 0, direction.includes('u') ? -1 : direction.includes('d') ? 1 : 0];
}
export function resolveTransitionKind(kind: string, seed: number): SlideTransitionKind | undefined {
  if (!isSlideTransitionKind(kind)) return;
  if (kind !== 'random') return kind;
  const choices = ['fade', 'push', 'wipe', 'split', 'dissolve', 'wheel', 'blinds', 'circle'] as const;
  return choices[Math.floor(noise(seed) * choices.length)];
}
/** Whole-slide and fragment choreography. Complex Office effects are browser approximations. */
function transitionFrame(transition: SlideTransition, progress: number, seed = 0): TransitionFrame {
  const p = clamp(progress), q = 1 - p;
  const kind = resolveTransitionKind(transition.kind, seed);
  const frame: TransitionFrame = { incoming: {}, outgoing: {}, front: 'incoming' };
  if (!kind || p === 1) { frame.outgoing.opacity = 0; return frame; }
  const effect = { ...transition, kind };
  const [x, y] = vector(transition.direction);
  const sign = x || y || -1;
  const horizontal = !y;
  const axis = horizontal ? 'Y' : 'X';
  const perspective = (degrees: number, scale = 1) => `perspective(1200px) rotate${axis}(${degrees}deg) scale(${scale})`;
  if (transition.throughBlack && ['cut', 'fade', 'reveal'].includes(kind)) {
    frame.incoming.opacity = clamp(p * 2 - 1);
    frame.outgoing.opacity = kind === 'cut' ? 0 : clamp(1 - p * 2);
    frame.background = '#000';
    return frame;
  }
  const mask = transitionMask(effect, p);
  if (mask !== undefined) {
    frame.incoming.mask = mask;
    if (kind === 'strips') frame.reflectMask = `translate(${transition.direction.includes('r') ? 1 : 0} ${transition.direction.includes('d') ? 1 : 0}) scale(${transition.direction.includes('r') ? -1 : 1} ${transition.direction.includes('d') ? -1 : 1})`;
    if (kind === 'ripple') frame.incoming.filter = `blur(${Math.sin(p * Math.PI) * 2}px)`;
    return frame;
  }
  switch (kind) {
    case 'cut': frame.outgoing.opacity = 0; break;
    case 'fade': frame.incoming.opacity = p; break;
    case 'push':
    case 'cover':
    case 'pull':
    case 'pan':
      if (kind !== 'pull') frame.incoming.transform = move(-x * q, -y * q);
      if (kind !== 'cover') frame.outgoing.transform = move(x * p, y * p);
      if (kind === 'pull') frame.front = 'outgoing';
      if (kind === 'pan') { frame.incoming.transform += ` scale(${1 + q * .15})`; frame.outgoing.transform += ` scale(${1 + p * .15})`; }
      break;
    case 'newsflash':
      frame.incoming.transform = `scale(${p}) rotate(${q * 720}deg)`;
      frame.incoming.opacity = p;
      break;
    case 'flash':
      frame.background = '#fff';
      frame.outgoing.opacity = clamp(1 - p * 3);
      frame.incoming.opacity = clamp(p * 3 - 2);
      break;
    case 'flip':
    case 'switch':
    case 'prism': {
      const angle = kind === 'prism' ? 90 : 180;
      frame.outgoing.transform = perspective(sign * p * angle * (transition.inverted ? -1 : 1), kind === 'switch' ? 1 - Math.sin(p * Math.PI) * .3 : 1);
      frame.incoming.transform = perspective(-sign * q * angle * (transition.inverted ? -1 : 1), kind === 'switch' ? 1 - Math.sin(p * Math.PI) * .3 : 1);
      frame.outgoing.opacity = p < .5 ? 1 : 0;
      frame.incoming.opacity = p < .5 ? 0 : 1;
      if (kind === 'prism') {
        frame.outgoing.origin = transition.content ? 'center' : `${x < 0 ? 'left' : x > 0 ? 'right' : 'center'} ${y < 0 ? 'top' : y > 0 ? 'bottom' : 'center'}`;
        frame.incoming.origin = frame.outgoing.origin;
      }
      break;
    }
    case 'ferris':
      frame.outgoing.origin = frame.incoming.origin = '50% 150%';
      frame.outgoing.transform = `rotate(${sign * p * 90}deg)`;
      frame.incoming.transform = `rotate(${-sign * q * 90}deg)`;
      break;
    case 'gallery':
    case 'conveyor':
      frame.outgoing.transform = `${move(sign * p, 0)} ${perspective(-sign * p * 65, 1 - p * .4)}`;
      frame.incoming.transform = `${move(-sign * q, 0)} ${perspective(sign * q * 65, 1 - q * .4)}`;
      frame.outgoing.origin = frame.incoming.origin = kind === 'gallery' ? 'center bottom' : 'center';
      break;
    case 'warp':
    case 'flythrough': {
      const entering = transition.direction !== 'out';
      const bounce = transition.bounce ? Math.sin(p * Math.PI * 3) * q * .15 : 0;
      frame.incoming.transform = `scale(${entering ? .01 + p * .99 + bounce : 2 - p + bounce})`;
      frame.outgoing.transform = `scale(${entering ? 1 + p * 3 : Math.max(.01, q)})`;
      if (kind === 'warp') { frame.incoming.transform += ` rotate(${q * 30}deg)`; frame.outgoing.filter = `blur(${p * 12}px)`; }
      frame.incoming.opacity = p;
      frame.outgoing.opacity = q;
      break;
    }
    case 'reveal':
      frame.front = 'outgoing';
      frame.outgoing.transform = `${move(sign * p, 0)} scale(${1 - p * .15})`;
      frame.incoming.transform = `scale(${.85 + p * .15})`;
      break;
    case 'fallOver':
      frame.front = 'outgoing';
      frame.outgoing.origin = transition.invertY ? 'center top' : 'center bottom';
      frame.outgoing.transform = `perspective(1200px) rotateX(${p * (transition.invertY ? 90 : -90)}deg)`;
      break;
    case 'crush':
      frame.front = 'outgoing';
      frame.outgoing.transform = `scale(${1 - p * .8}, ${q}) skewX(${p * 25}deg)`;
      frame.outgoing.opacity = q;
      break;
    case 'peelOff':
    case 'pageCurlSingle':
    case 'airplane':
    case 'origami':
      frame.front = 'outgoing';
      frame.outgoing.origin = transition.invertX ? 'left top' : 'right top';
      frame.outgoing.transform = `${move((transition.invertX ? -1 : 1) * p, (transition.invertY ? 1 : -1) * p)} rotate(${p * (transition.invertX ? -1 : 1) * (kind === 'airplane' ? 45 : 20)}deg) scale(${kind === 'airplane' || kind === 'origami' ? q : 1}, ${kind === 'origami' ? q : 1}) skewY(${kind === 'pageCurlSingle' ? p * 30 : 0}deg)`;
      frame.outgoing.opacity = clamp(q * 2);
      break;
    case 'doors': case 'window': case 'pageCurlDouble': case 'curtains': case 'drape':
    case 'wind': case 'prestige': case 'fracture': case 'shred': case 'vortex': {
      frame.front = 'outgoing';
      frame.outgoing.opacity = 0;
      frame.pieces = transitionPieces(effect, p);
      break;
    }
    // Mask transitions return above. Keeping cases explicit makes catalog additions visible here.
    case 'wipe': case 'circle': case 'diamond': case 'plus': case 'zoom': case 'split':
    case 'blinds': case 'comb': case 'randomBar': case 'checker': case 'dissolve':
    case 'glitter': case 'honeycomb': case 'strips': case 'wedge': case 'wheel':
    case 'wheelReverse': case 'ripple': case 'random': break;
    default: { const exhaustive: never = kind; return exhaustive; }
  }
  return frame;
}
function transitionPieces(effect: SlideTransition, p: number): TransitionPiece[] {
  const k = effect.kind;
  const paired = ['doors', 'window', 'pageCurlDouble', 'curtains'].includes(k);
  const strips = ['drape', 'wind', 'shred', 'prestige'].includes(k) && effect.pattern !== 'rectangle';
  const cols = paired ? (effect.orientation === 'vert' ? 1 : 2) : strips ? 12 : 4;
  const rows = paired ? (effect.orientation === 'vert' ? 2 : 1) : strips ? 1 : 3;
  return Array.from({ length: cols * rows * (k === 'fracture' ? 2 : 1) }, (_, i) => {
    const cell = k === 'fracture' ? Math.floor(i / 2) : i;
    const col = cell % cols, row = Math.floor(cell / cols);
    const x = col / cols, y = row / rows, w = 1 / cols, h = 1 / rows;
    const progress = paired ? p : clamp((p - noise(i) * .25) / .75);
    const sign = (effect.invertX ? -1 : 1);
    const visual: TransitionVisual = { opacity: 1 - Math.pow(progress, 4), origin: `${(x + w / 2) * 100}% ${(y + h / 2) * 100}%` };
    const clip = k === 'fracture' ? polygon(i % 2 ? [[x, y], [x + w, y + h], [x, y + h]] : [[x, y], [x + w, y], [x + w, y + h]]) : rectangle(x, y, w, h);
    if (paired) {
      const side = i ? 1 : -1;
      const vertical = effect.orientation === 'vert';
      visual.origin = vertical ? `50% ${i ? '100%' : '0%'}` : `${i ? '100%' : '0%'} 50%`;
      visual.transform = k === 'doors' || k === 'pageCurlDouble'
        ? `perspective(1200px) rotate${vertical ? 'X' : 'Y'}(${side * progress * 100}deg)`
        : vertical ? move(0, side * progress) : `${move(side * progress, 0)} scaleX(${k === 'curtains' ? 1 - progress * .4 : 1})`;
    } else if (k === 'vortex') {
      const [vx, vy] = vector(effect.direction);
      const angle = progress * Math.PI * 3 * (vx || vy || 1);
      visual.transform = `${move((.5 - x - w / 2 + vx * .3) * progress, (.5 - y - h / 2 + vy * .3) * progress)} rotate(${angle * 180 / Math.PI}deg) scale(${1 - progress})`;
      visual.origin = `${(x + w / 2) * 100}% ${(y + h / 2) * 100}%`;
    } else if (k === 'drape') {
      visual.transform = `${move(0, (effect.invertY ? 1 : -1) * progress)} scaleY(${1 - progress * .6})`;
      visual.origin = 'top';
    } else if (k === 'prestige') {
      visual.transform = `${move((.5 - x) * progress, -.3 * Math.sin(progress * Math.PI))} rotateY(${progress * 180}deg) scale(${1 - progress})`;
    } else {
      const inward = k === 'shred' && effect.direction === 'in';
      visual.transform = inward
        ? `${move((.5 - x) * progress, (.5 - y) * progress)} scale(${1 - progress}) rotate(${progress * 90}deg)`
        : `${move((k === 'wind' ? sign * 1.5 : (x - .5) * 2) * progress, (k === 'wind' ? -.3 * noise(i) : 1 + noise(i)) * progress)} rotate(${(noise(i) - .5) * progress * 180}deg)`;
    }
    return { clip, visual };
  });
}

/** Reflect motion and clip geometry together, leaving the slide content itself readable. */
export function presentationTransitionFrame(transition: SlideTransition, progress: number, seed = 0): TransitionFrame {
  const frame = transitionFrame({ ...transition, invertX: false, invertY: false }, progress, seed);
  if (!transition.invertX && !transition.invertY) return frame;
  const x = transition.invertX ? -1 : 1, y = transition.invertY ? -1 : 1;
  const reflect = (visual: TransitionVisual): TransitionVisual => ({
    ...visual,
    ...(visual.transform ? { transform: `scale(${x}, ${y}) ${visual.transform} scale(${x}, ${y})` } : {}),
    ...(visual.origin ? { origin: visual.origin.replace(/left|right|top|bottom/g, word =>
      word === 'left' ? x < 0 ? 'right' : word : word === 'right' ? x < 0 ? 'left' : word : word === 'top' ? y < 0 ? 'bottom' : word : y < 0 ? 'top' : word) } : {}),
  });
  const reflection = `translate(${x < 0 ? 1 : 0} ${y < 0 ? 1 : 0}) scale(${x} ${y})`;
  return { ...frame, incoming: reflect(frame.incoming), outgoing: reflect(frame.outgoing),
    ...(frame.pieces ? { pieces: frame.pieces.map(piece => ({ ...piece, visual: reflect(piece.visual), reflection })) } : {}),
  };
}
