import type { SlideTransition } from '@tumblerjs/slides';
export const unitSquare = 'M0 0H1V1H0Z';
const n = (value: number) => Math.round(value * 100000) / 100000;
export const polygon = (points: readonly (readonly [number, number])[]) => `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
export const rectangle = (x: number, y: number, w: number, h: number) => polygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
export const clamp = (t: number) => Math.max(0, Math.min(1, t));
/** Stable pseudo-random order keeps replay and tests independent of frame rate. */
export const noise = (index: number) => ((Math.imul(index + 1, 1597334677) ^ Math.imul(index + 11, 3812015801)) >>> 0) / 4294967296;
function radial(cx: number, cy: number, radius: number, start: number, end: number, count = 32) {
  return polygon([[cx, cy], ...Array.from({ length: count + 1 }, (_, i): [number, number] => {
    const angle = start + (end - start) * i / count;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  })]);
}
/** Object-bounding-box paths work at every slide size without a bitmap snapshot. */
export function transitionMask(transition: SlideTransition, t: number): string | undefined {
  const p = clamp(t), k = transition.kind, direction = transition.direction;
  if (!['wipe', 'circle', 'diamond', 'plus', 'zoom', 'split', 'blinds', 'comb', 'randomBar', 'checker', 'dissolve', 'glitter', 'honeycomb', 'strips', 'wedge', 'wheel', 'wheelReverse', 'ripple'].includes(k)) return;
  if (p === 1) return unitSquare;
  if (p === 0) return 'M0 0Z';
  const vertical = transition.orientation === 'vert';
  switch (k) {
    case 'wipe':
      return direction === 'r' ? rectangle(0, 0, p, 1) : direction === 'u' ? rectangle(0, 1 - p, 1, p) : direction === 'd' ? rectangle(0, 0, 1, p) : rectangle(1 - p, 0, p, 1);
    case 'circle': return radial(.5, .5, Math.SQRT1_2 * p, 0, Math.PI * 2);
    case 'diamond': return polygon([[.5, .5 - p], [.5 + p, .5], [.5, .5 + p], [.5 - p, .5]]);
    case 'plus':
      return polygon([[.5 - p / 2, 0], [.5 + p / 2, 0], [.5 + p / 2, .5 - p / 2], [1, .5 - p / 2], [1, .5 + p / 2], [.5 + p / 2, .5 + p / 2], [.5 + p / 2, 1], [.5 - p / 2, 1], [.5 - p / 2, .5 + p / 2], [0, .5 + p / 2], [0, .5 - p / 2], [.5 - p / 2, .5 - p / 2]]);
    case 'zoom': {
      const box = direction === 'in' ? 1 - p : p;
      const path = rectangle((1 - box) / 2, (1 - box) / 2, box, box);
      return direction === 'in' ? unitSquare + path : path;
    }
    case 'split': {
      const size = direction === 'in' ? 1 - p : p;
      const path = vertical ? rectangle((1 - size) / 2, 0, size, 1) : rectangle(0, (1 - size) / 2, 1, size);
      return direction === 'in' ? unitSquare + path : path;
    }
    case 'blinds':
    case 'comb':
    case 'randomBar': {
      return Array.from({ length: 12 }, (_, i) => {
        const amount = k === 'randomBar' ? clamp((p - noise(i) * .65) / .35) : p;
        if (k === 'comb') return vertical ? rectangle(i / 12, i % 2 ? 1 - p : 0, 1 / 12, p) : rectangle(i % 2 ? 1 - p : 0, i / 12, p, 1 / 12);
        return vertical ? rectangle(i / 12, 0, amount / 12, 1) : rectangle(0, i / 12, 1, amount / 12);
      }).join('');
    }
    case 'checker':
    case 'dissolve':
    case 'glitter':
    case 'honeycomb': {
      return Array.from({ length: 96 }, (_, i) => {
        const col = i % 12, row = Math.floor(i / 12);
        const rank = k === 'glitter' ? direction === 'r' ? col / 12 : direction === 'u' ? 1 - row / 8 : direction === 'd' ? row / 8 : 1 - col / 12 : noise(i);
        const amount = k === 'checker' ? clamp(p * 2 - ((col + row) % 2)) : clamp((p - rank * .7) / .3);
        const x = (col + .5) / 12, y = (row + .5) / 8;
        if (k === 'honeycomb' || (k === 'glitter' && transition.pattern === 'hexagon'))
          return polygon(Array.from({ length: 6 }, (_, j): [number, number] => [x + Math.cos(j * Math.PI / 3) * amount / 10, y + Math.sin(j * Math.PI / 3) * amount / 7]));
        if (k === 'glitter') return polygon([[x, y - amount / 8], [x + amount / 12, y], [x, y + amount / 8], [x - amount / 12, y]]);
        return rectangle(col / 12, row / 8, (vertical ? 1 : amount) / 12, (vertical ? amount : 1) / 8);
      }).join('');
    }
    case 'strips': {
      const path = polygon([[0, 0], [2 * p, 0], [0, 2 * p]]);
      // Reflection is performed by the player so corner directions use the same path.
      return path;
    }
    case 'wedge': return radial(.5, .5, 1, -Math.PI / 2 - Math.PI * p, -Math.PI / 2 + Math.PI * p);
    case 'wheel':
    case 'wheelReverse': {
      const spokes = Math.max(1, Math.min(32, transition.spokes ?? 1));
      const sign = k === 'wheelReverse' ? -1 : 1;
      return Array.from({ length: spokes }, (_, i) => radial(.5, .5, 1, -Math.PI / 2 + sign * i * Math.PI * 2 / spokes, -Math.PI / 2 + sign * (i + p) * Math.PI * 2 / spokes, 20)).join('');
    }
    case 'ripple': {
      const x = direction.includes('l') ? 0 : direction.includes('r') ? 1 : .5;
      const y = direction.includes('u') ? 0 : direction.includes('d') ? 1 : .5;
      return radial(x, y, Math.SQRT2 * p, 0, Math.PI * 2);
    }
    default: return undefined;
  }
}
