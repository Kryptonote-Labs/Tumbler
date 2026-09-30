export interface ZoomGesture {
  readonly factor: number;
  readonly x: number;
  readonly y: number;
  readonly targetX: number;
  readonly targetY: number;
}

/** Handle document zoom without intercepting ordinary wheel or single-finger scrolling. */
export function zoomGesture(element: HTMLElement, zoom: (gesture: ZoomGesture) => void) {
  let pinch: { distance: number; x: number; y: number } | undefined;
  let gestureScale: number | undefined;
  let pending: ZoomGesture | undefined;
  let frame = 0;
  function enqueue(gesture: ZoomGesture) {
    if (pending === undefined) pending = gesture;
    else {
      // Compose both zoom and midpoint movement when events arrive within one frame.
      pending = {
        factor: pending.factor * gesture.factor,
        x: pending.x,
        y: pending.y,
        targetX: gesture.targetX + (pending.targetX - gesture.x) * gesture.factor,
        targetY: gesture.targetY + (pending.targetY - gesture.y) * gesture.factor,
      };
    }
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const next = pending;
      pending = undefined;
      if (next !== undefined) zoom(next);
    });
  }
  function wheel(event: WheelEvent) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    if (gestureScale !== undefined) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
    enqueue({ factor: Math.exp(-event.deltaY * unit * 0.01), x: event.clientX, y: event.clientY, targetX: event.clientX, targetY: event.clientY });
  }
  function touch(event: TouchEvent) {
    if (event.touches.length !== 2) { pinch = undefined; return; }
    event.preventDefault();
    if (gestureScale !== undefined) return;
    const first = event.touches[0]!;
    const second = event.touches[1]!;
    const next = {
      distance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    };
    if (pinch !== undefined && pinch.distance > 0) enqueue({ factor: next.distance / pinch.distance, x: pinch.x, y: pinch.y, targetX: next.x, targetY: next.y });
    pinch = next;
  }
  // Safari reports a cumulative scale; feed incremental factors into the frame batch.
  function gestureStart(event: Event) {
    event.preventDefault();
    gestureScale = 1;
    pinch = undefined;
  }
  function gestureChange(event: Event) {
    if (gestureScale === undefined || !('scale' in event) || typeof event.scale !== 'number' || !Number.isFinite(event.scale) || event.scale <= 0) return;
    event.preventDefault();
    const bounds = element.getBoundingClientRect();
    const x = 'clientX' in event && typeof event.clientX === 'number' ? event.clientX : bounds.left + element.clientWidth / 2;
    const y = 'clientY' in event && typeof event.clientY === 'number' ? event.clientY : bounds.top + element.clientHeight / 2;
    enqueue({ factor: event.scale / gestureScale, x, y, targetX: x, targetY: y });
    gestureScale = event.scale;
  }
  function gestureEnd(event: Event) {
    event.preventDefault();
    gestureScale = undefined;
    pinch = undefined;
  }
  function end() { pinch = undefined; }
  element.addEventListener('gesturestart', gestureStart, { passive: false });
  element.addEventListener('gesturechange', gestureChange, { passive: false });
  element.addEventListener('gestureend', gestureEnd, { passive: false });
  element.addEventListener('wheel', wheel, { passive: false });
  element.addEventListener('touchstart', touch, { passive: false });
  element.addEventListener('touchmove', touch, { passive: false });
  element.addEventListener('touchend', end);
  element.addEventListener('touchcancel', end);
  return { destroy() {
    cancelAnimationFrame(frame);
    pending = undefined;
    element.removeEventListener('gesturestart', gestureStart);
    element.removeEventListener('gesturechange', gestureChange);
    element.removeEventListener('gestureend', gestureEnd);
    element.removeEventListener('wheel', wheel);
    element.removeEventListener('touchstart', touch);
    element.removeEventListener('touchmove', touch);
    element.removeEventListener('touchend', end);
    element.removeEventListener('touchcancel', end);
  } };
}
