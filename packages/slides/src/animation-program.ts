import type { Matrix, PresentationSlide } from './model.ts';
import type { AnimationTrack, AnimationKey, SlideAnimation } from './animation.ts';
import { animationNumber, type AnimationVariables } from './animation-expression.ts';

export interface AnimationFrame {
  readonly target: string;
  readonly matrix: Matrix;
  readonly opacity: number;
  readonly visible: boolean;
  readonly clip: string;
}
interface Target {
  readonly id: string;
  readonly matrix: Matrix;
  readonly width: number;
  readonly height: number;
  readonly variables: AnimationVariables;
  readonly entrance: boolean;
}
interface CompiledTrack {
  readonly cue: SlideAnimation;
  readonly track: AnimationTrack;
  readonly values: readonly { time: number; value: number }[];
}
/** Piecewise constant-acceleration time mapping from ECMA-376 accel/decel fractions. */
export function animationProgress(progress: number, acceleration: number, deceleration: number) {
  let a = Math.max(0, acceleration),
    d = Math.max(0, deceleration);
  if (a + d > 1) {
    const sum = a + d;
    a /= sum;
    d /= sum;
  }
  const speed = 1 / (1 - (a + d) / 2);
  if (a && progress < a) return (speed * progress * progress) / (2 * a);
  if (d && progress > 1 - d) return 1 - (speed * (1 - progress) ** 2) / (2 * d);
  return speed * (progress - a / 2);
}
const clamp = (value: number) => Math.max(0, Math.min(1, value));
function interpolate(keys: CompiledTrack['values'], time: number) {
  if (!keys.length) return;
  const rightIndex = keys.findIndex((key) => key.time >= time);
  if (rightIndex <= 0) return rightIndex === 0 ? keys[0]!.value : keys.at(-1)!.value;
  const left = keys[rightIndex - 1]!,
    right = keys[rightIndex]!;
  return (
    left.value +
    (right.value - left.value) * clamp((time - left.time) / (right.time - left.time || 1))
  );
}
function legacyTracks(cue: SlideAnimation): readonly AnimationTrack[] {
  return [
    {
      target: cue.target,
      delay: 0,
      duration: cue.duration,
      acceleration: 0,
      deceleration: 0,
      autoReverse: false,
      repeat: 1,
      hold: true,
      behavior:
        cue.kind === 'appear'
          ? { kind: 'visibility', visible: cue.entrance }
          : {
              kind: 'filter',
              filter: cue.kind === 'wipe' ? `wipe(${cue.direction})` : 'fade',
              entrance: cue.entrance,
            },
    },
  ];
}
function reveal(filter: string, p: number): string {
  const hidden = (1 - p) * 100;
  switch (filter) {
    case 'wipe(right)':
      return `inset(0 ${hidden}% 0 0)`;
    case 'wipe(left)':
      return `inset(0 0 0 ${hidden}%)`;
    case 'wipe(down)':
      return `inset(0 0 ${hidden}% 0)`;
    case 'wipe(up)':
      return `inset(${hidden}% 0 0 0)`;
    case 'barn(outHorizontal)':
      return `inset(${hidden / 2}% 0)`;
    case 'barn(outVertical)':
      return `inset(0 ${hidden / 2}%)`;
    // A single concave polygon reveals both edges without duplicating the object's content.
    case 'barn(inHorizontal)':
      return `polygon(0 0,100% 0,100% ${p * 50}%,0 ${p * 50}%,0 ${100 - p * 50}%,100% ${100 - p * 50}%,100% 100%,0 100%)`;
    case 'barn(inVertical)':
      return `polygon(0 0,${p * 50}% 0,${p * 50}% 100%,${100 - p * 50}% 100%,${100 - p * 50}% 0,100% 0,100% 100%,0 100%)`;
    default:
      return '';
  }
}
/** Compile geometry and numeric keys once. The player does no DOM reads or XML work. */
export function createPresentationAnimationPlayer(
  slide: Pick<PresentationSlide, 'objects' | 'animations'>,
  width: number,
  height: number,
) {
  const cues = slide.animations ?? [];
  const targets = new Map<string, Target>();
  const objects = new Map(slide.objects.map((object) => [object.shapeId, object]));
  const tracks: CompiledTrack[] = [];
  for (const cue of cues)
    for (const track of cue.tracks ?? legacyTracks(cue)) {
      const object = objects.get(track.target);
      if (!object || track.paragraphs) continue;
      const matrix = object.matrix,
        w = object.transform.width,
        h = object.transform.height;
      const variables = {
        ppt_x: ((matrix[0] * w) / 2 + (matrix[2] * h) / 2 + matrix[4]) / width,
        ppt_y: ((matrix[1] * w) / 2 + (matrix[3] * h) / 2 + matrix[5]) / height,
        ppt_w: (Math.abs(matrix[0]) * w + Math.abs(matrix[2]) * h) / width,
        ppt_h: (Math.abs(matrix[1]) * w + Math.abs(matrix[3]) * h) / height,
        time: 0,
      };
      const previous = targets.get(track.target);
      targets.set(track.target, {
        id: track.target,
        matrix,
        width: w,
        height: h,
        variables,
        entrance: previous?.entrance ?? (cue.entrance && track.behavior.kind !== 'unsupported'),
      });
      const values =
        track.behavior.kind === 'number'
          ? track.behavior.keys
              .flatMap((key: AnimationKey) => {
                const value = animationNumber(key.value, {
                  ...variables,
                  time: key.time,
                });
                return value === undefined ? [] : [{ time: key.time, value }];
              })
              .sort((a, b) => a.time - b.time)
          : [];
      tracks.push({ cue, track, values });
    }
  const activated = new Map<number, number>([[0, 0]]);
  let currentStep = 0;
  let active = true;
  function reset(now = 0) {
    activated.clear();
    activated.set(0, now);
    currentStep = 0;
    active = true;
  }
  function advance(now: number) {
    const next = Math.min(...cues.filter((cue) => cue.step > currentStep).map((cue) => cue.step));
    if (!Number.isFinite(next)) return false;
    // Completing the current click group matches presenter navigation, while with/after share its clock.
    for (const [step, started] of activated) {
      const end = Math.max(
        0,
        ...cues.filter((cue) => cue.step === step).map((cue) => cue.delay + cue.duration),
      );
      activated.set(step, Math.min(started, now - end));
    }
    currentStep = next;
    activated.set(next, now);
    active = true;
    return true;
  }
  function sample(now: number): readonly AnimationFrame[] {
    active = false;
    const states = new Map(
      [...targets].map(([id, target]) => [
        id,
        {
          target,
          x: 0,
          y: 0,
          sx: 1,
          sy: 1,
          rotation: 0,
          opacity: 1,
          visible: !target.entrance,
          clip: '',
        },
      ]),
    );
    for (const compiled of tracks) {
      const { cue, track, values } = compiled,
        state = states.get(track.target)!;
      const activation = activated.get(cue.step);
      if (activation === undefined) continue;
      const elapsed = now - activation - cue.delay - track.delay;
      const cycleDuration = track.duration * (track.autoReverse ? 2 : 1),
        total = cycleDuration * track.repeat;
      if (elapsed < 0) {
        active = true;
        continue;
      }
      if (elapsed < total) active = true;
      if (elapsed >= total && !track.hold) continue;
      let progress =
        elapsed >= total
          ? track.autoReverse
            ? 0
            : 1
          : track.duration
            ? (elapsed % cycleDuration) / track.duration
            : 1;
      if (track.autoReverse && progress > 1) progress = 2 - progress;
      progress = animationProgress(clamp(progress), track.acceleration, track.deceleration);
      const behavior = track.behavior;
      if (behavior.kind === 'visibility') state.visible = behavior.visible;
      else if (behavior.kind === 'filter') {
        state.visible = true;
        const p = behavior.entrance ? progress : 1 - progress;
        if (behavior.filter === 'fade') {
          state.opacity = p;
          state.clip = '';
        } else state.clip = reveal(behavior.filter, p);
      } else if (behavior.kind === 'number') {
        const value = interpolate(values, progress);
        if (value === undefined) continue;
        state.visible = true;
        const base = state.target.variables;
        switch (behavior.property) {
          case 'x':
            state.x = behavior.additive ? state.x + value * width : (value - base.ppt_x) * width;
            break;
          case 'y':
            state.y = behavior.additive ? state.y + value * height : (value - base.ppt_y) * height;
            break;
          case 'width':
            state.sx *= base.ppt_w ? value / base.ppt_w : 1;
            break;
          case 'height':
            state.sy *= base.ppt_h ? value / base.ppt_h : 1;
            break;
          case 'scaleX':
            state.sx *= value;
            break;
          case 'scaleY':
            state.sy *= value;
            break;
          case 'rotation':
            state.rotation += value;
            break;
          case 'opacity':
            state.opacity = value;
            break;
        }
      }
    }
    return [...states.values()].map((state) => {
      const { target, sx, sy, x, y } = state,
        [a, b, c, d, e, f] = target.matrix;
      const angle = (state.rotation * Math.PI) / 180,
        cos = Math.cos(angle),
        sin = Math.sin(angle);
      const na = (cos * a - sin * b) * sx,
        nb = (sin * a + cos * b) * sx,
        nc = (cos * c - sin * d) * sy,
        nd = (sin * c + cos * d) * sy;
      const matrix: Matrix = [
        na,
        nb,
        nc,
        nd,
        e + x + ((a - na) * target.width) / 2 + ((c - nc) * target.height) / 2,
        f + y + ((b - nb) * target.width) / 2 + ((d - nd) * target.height) / 2,
      ];
      return {
        target: target.id,
        matrix,
        opacity: clamp(state.opacity),
        visible: state.visible,
        clip: state.clip,
      };
    });
  }
  return {
    reset,
    advance,
    sample,
    get step() {
      return currentStep;
    },
    get running() {
      return active;
    },
  };
}
