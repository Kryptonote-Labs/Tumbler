import type { EditorView } from 'prosemirror-view';

type Bounds = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>;

/** Names live outside the editor's scrollers; carets and selections stay in the document. */
export function notePresenceLabels(view: EditorView) {
  const document = view.dom.ownerDocument;
  const window = document.defaultView!;
  const labels = new Map<HTMLElement, HTMLSpanElement>();
  let frame: number | undefined;

  function clip(node: HTMLElement | null, bounds: Bounds, stop: HTMLElement | null = null) {
    let { left, top, right, bottom } = bounds;
    for (; node && node !== stop; node = node.parentElement) {
      const style = window.getComputedStyle(node);
      if (style.contentVisibility === 'hidden' || style.display === 'none') return;
      const x = /auto|scroll|hidden|clip/.test(style.overflowX || style.overflow);
      const y = /auto|scroll|hidden|clip/.test(style.overflowY || style.overflow);
      if (!x && !y) continue;
      const rect = node.getBoundingClientRect();
      if (x) {
        left = Math.max(left, rect.left);
        right = Math.min(right, rect.right);
      }
      if (y) {
        top = Math.max(top, rect.top);
        bottom = Math.min(bottom, rect.bottom);
      }
    }
    return { left, top, right, bottom };
  }
  function position() {
    frame = undefined;
    const bounds = clip(view.dom.parentElement, {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    });
    if (!bounds) {
      for (const label of labels.values()) label.style.visibility = 'hidden';
      return;
    }
    const positions = [...labels].map(([caret, label]) => {
      const anchor = caret.getBoundingClientRect();
      const visible = clip(caret.parentElement, bounds, view.dom.parentElement);
      const size = label.getBoundingClientRect();
      const width = Math.max(0, bounds.right - bounds.left);
      const left = Math.max(
        bounds.left,
        Math.min(anchor.left, bounds.right - Math.min(size.width, width)),
      );
      const above = anchor.top - size.height;
      const top = Math.max(
        bounds.top,
        Math.min(above >= bounds.top ? above : anchor.bottom, bounds.bottom - size.height),
      );
      return {
        label,
        left,
        top,
        width,
        visible:
          !!visible &&
          caret.isConnected &&
          anchor.height > 0 &&
          anchor.right > visible.left &&
          anchor.left < visible.right &&
          anchor.bottom > visible.top &&
          anchor.top < visible.bottom,
      };
    });
    for (const { label, left, top, width, visible } of positions) {
      label.style.left = `${left}px`;
      label.style.top = `${top}px`;
      label.style.maxWidth = `${width}px`;
      label.style.visibility = visible ? 'visible' : 'hidden';
    }
  }
  function schedule() {
    if (labels.size && frame === undefined) frame = window.requestAnimationFrame(position);
  }
  function update() {
    const carets = new Set(
      view.dom.querySelectorAll<HTMLElement>('.note-peer-caret:not(.unfocused)'),
    );
    for (const [caret, label] of labels) {
      if (carets.has(caret)) continue;
      label.remove();
      labels.delete(caret);
    }
    for (const caret of carets) {
      if (labels.has(caret)) continue;
      const label = document.createElement('span');
      label.className = 'note-peer-label';
      label.textContent = caret.dataset.peerName ?? '';
      label.style.setProperty(
        '--note-peer-color',
        caret.style.getPropertyValue('--note-peer-color'),
      );
      label.style.visibility = 'hidden';
      label.setAttribute('aria-hidden', 'true');
      document.body.append(label);
      labels.set(caret, label);
    }
    schedule();
  }
  const resize = new window.ResizeObserver(schedule);
  const mutation = new window.MutationObserver(schedule);
  for (let node: HTMLElement | null = view.dom; node; node = node.parentElement) {
    resize.observe(node);
    mutation.observe(node, {
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'data-code-wrap'],
    });
  }
  window.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule);
  update();
  return {
    update,
    destroy() {
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      resize.disconnect();
      mutation.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      for (const label of labels.values()) label.remove();
      labels.clear();
    },
  };
}
