import { retainPresentationImageUrl } from './presentation-image-url.ts';
import { isSlideTransitionKind, type PresentationSlide } from '@tumblerjs/slides';
import { presentationTransitionFrame, type TransitionVisual } from './presentation-transition-effects.ts';
const SVG = 'http://www.w3.org/2000/svg';
let snapshotId = 0;
export interface TransitionPlaybackOptions {
  slide: PresentationSlide;
  playing: boolean;
  editable: boolean;
}
/** Copies visible animation state and rewrites IDs so old/new slide definitions cannot collide. */
function snapshot(node: SVGSVGElement): SVGSVGElement {
  const clone = node.cloneNode(true) as SVGSVGElement;
  const originalNodes = [node, ...node.querySelectorAll<SVGElement | HTMLElement>('*')];
  const copyNodes = [clone, ...clone.querySelectorAll<SVGElement | HTMLElement>('*')];
  const idPrefix = `tumbler-transition-${++snapshotId}-`;
  const ids = new Map(copyNodes.filter(n => n.id).map(n => [n.id, idPrefix + n.id]));
  copyNodes.forEach((copy, i) => {
    const original = originalNodes[i]!;
    if (typeof original.getAnimations === 'function' && original.getAnimations().length) {
      const computed = node.ownerDocument.defaultView!.getComputedStyle(original);
      for (const property of ['opacity', 'transform', 'clip-path']) copy.style.setProperty(property, computed.getPropertyValue(property));
    }
    for (const attribute of Array.from(copy.attributes)) {
      let value = attribute.value;
      if (attribute.name === 'id') value = ids.get(value) ?? value;
      else {
        value = value.replace(/url\(["']?#([^)'"\s]+)["']?\)/g, (match, id: string) => ids.has(id) ? `url(#${ids.get(id)})` : match);
        if (['href', 'xlink:href'].includes(attribute.name) && value.startsWith('#')) value = `#${ids.get(value.slice(1)) ?? value.slice(1)}`;
        if (['aria-labelledby', 'aria-describedby'].includes(attribute.name)) value = value.split(/\s+/).map(id => ids.get(id) ?? id).join(' ');
      }
      if (attribute.namespaceURI) copy.setAttributeNS(attribute.namespaceURI, attribute.name, value);
      else copy.setAttribute(attribute.name, value);
    }
    copy.removeAttribute('tabindex');
    copy.removeAttribute('contenteditable');
  });
  clone.setAttribute('aria-hidden', 'true');
  clone.style.pointerEvents = 'none';
  return clone;
}
interface Layer {
  svg: SVGSVGElement;
  path: SVGPathElement;
  clip: SVGClipPathElement;
  defs: SVGDefsElement;
}
function layer(svg: SVGSVGElement): Layer {
  const doc = svg.ownerDocument;
  const defs = doc.createElementNS(SVG, 'defs'), clip = doc.createElementNS(SVG, 'clipPath'), path = doc.createElementNS(SVG, 'path');
  clip.id = `tumbler-transition-clip-${++snapshotId}`;
  clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  clip.append(path); defs.append(clip); svg.append(defs);
  return { svg, path, clip, defs };
}
function paint(layer: Layer, visual: TransitionVisual, complement: boolean, reflection?: string) {
  const style = layer.svg.style;
  style.transform = visual.transform ?? '';
  style.transformOrigin = visual.origin ?? 'center';
  style.opacity = String(visual.opacity ?? 1);
  style.filter = visual.filter ?? '';
  if (visual.mask) {
    // Outer SVG clips use CSS pixels. Explicit sizing also follows viewport changes during playback.
    layer.clip.setAttribute('transform', `scale(${layer.svg.clientWidth} ${layer.svg.clientHeight})`);
    layer.path.setAttribute('d', visual.mask);
    layer.path.setAttribute('clip-rule', complement ? 'evenodd' : 'nonzero');
    layer.path.setAttribute('transform', reflection ?? '');
    style.clipPath = `url(#${layer.clip.id})`;
  } else style.clipPath = '';
}
const positioned = (node: SVGSVGElement) => {
  Object.assign(node.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', margin: '0' });
};

/** Capture in $effect.pre, then play after the incoming SVG has updated. Only playback owns these nodes. */
export function createPresentationTransitionPlayer() {
  let lastPart: string | undefined;
  let saved: SVGSVGElement | undefined;
  let active: (() => void) | undefined;
  let resources: { release: () => void }[] = [];
  const release = () => { resources.forEach(r => r.release()); resources = []; };
  let enabled = false;
  let deadline = 0;
  let now = () => 0;
  return {
    capture(node: SVGSVGElement | undefined, nextPart: string) {
      if (!node || nextPart === lastPart) return;
      active?.();
      release();
      saved = enabled ? snapshot(node) : undefined;
      if (saved) {
        const urls = new Set(Array.from(saved.querySelectorAll('[href], [src], [poster]')).flatMap(n => ['href', 'src', 'poster'].map(a => n.getAttribute(a) ?? '')));
        resources = [...urls].flatMap(url => { const held = retainPresentationImageUrl(url); return held ? [held] : []; });
      }
    },
    finish() { active?.(); },
    remaining() { return Math.max(0, deadline - now()); },
    action(node: SVGSVGElement, initial: TransitionPlaybackOptions) {
      const view = node.ownerDocument.defaultView!;
      now = () => view.performance.now();
      const reducedMotion = view.matchMedia?.('(prefers-reduced-motion: reduce)');
      const reduce = () => { if (reducedMotion?.matches) active?.(); };
      reducedMotion?.addEventListener('change', reduce);
      function update(options: TransitionPlaybackOptions) {
        const changed = lastPart !== options.slide.part;
        enabled = options.playing && !options.editable;
        lastPart = options.slide.part;
        if (!enabled) { active?.(); saved = undefined; release(); return; }
        if (!changed) return;
        const outgoing = saved;
        saved = undefined;
        const transition = options.slide.transition;
        if (!outgoing || !transition || transition.duration <= 0 || reducedMotion?.matches || !isSlideTransitionKind(transition.kind) || (transition.kind === 'cut' && !transition.throughBlack)) { release(); return; }
        const frame = node.parentElement!;
        const oldStyle = node.getAttribute('style');
        const oldBackground = frame.style.background;
        const incoming = layer(node), previous = layer(outgoing);
        positioned(outgoing);
        node.style.position = 'relative';
        outgoing.style.pointerEvents = 'none';
        // HTML inert covers native links and controls inside SVG foreignObject descendants.
        const snapshots = node.ownerDocument.createElement('div');
        snapshots.inert = true;
        snapshots.setAttribute('aria-hidden', 'true');
        snapshots.style.display = 'contents';
        snapshots.append(outgoing);
        frame.prepend(snapshots);
        const seed = Array.from(options.slide.part).reduce((n, c) => n + c.charCodeAt(0), 0);
        const first = presentationTransitionFrame(transition, 0, seed);
        const pieces = (first.pieces ?? []).map(piece => {
          const copy = snapshot(outgoing), result = layer(copy);
          positioned(copy);
          copy.style.zIndex = '3';
          result.path.setAttribute('d', piece.clip);
          copy.style.clipPath = `url(#${result.clip.id})`;
          snapshots.append(copy);
          return result;
        });
        let raf = 0, done = false;
        const started = view.performance.now();
        deadline = started + transition.duration;
        const finish = () => {
          if (done) return;
          done = true;
          deadline = 0;
          view.cancelAnimationFrame(raf);
          snapshots.remove();
          release();
          incoming.defs.remove();
          if (oldStyle === null) node.removeAttribute('style'); else node.setAttribute('style', oldStyle);
          frame.style.background = oldBackground;
          active = undefined;
        }
        active = finish;
        const render = (time: number) => {
          if (done) return;
          const progress = Math.min(1, Math.max(0, (time - started) / transition!.duration));
          if (progress >= 1) { finish(); return; }
          const state = presentationTransitionFrame(transition!, progress, seed);
          const complement = ['split', 'zoom'].includes(transition!.kind) && transition!.direction === 'in';
          paint(incoming, state.incoming, complement, state.reflectMask);
          paint(previous, state.outgoing, false);
          node.style.zIndex = state.front === 'incoming' ? '2' : '0';
          outgoing.style.zIndex = '1';
          frame.style.background = state.background ?? '#000';
          pieces.forEach((piece, i) => {
            const value = state.pieces?.[i];
            if (!value) return;
            paint(piece, { ...value.visual, mask: value.clip }, false, value.reflection);
          });
          raf = view.requestAnimationFrame(render);
        }
        render(started);
      }
      update(initial);
      return { update, destroy() { active?.(); saved = undefined; release(); enabled = false; reducedMotion?.removeEventListener('change', reduce); } };
    },
  };
}
