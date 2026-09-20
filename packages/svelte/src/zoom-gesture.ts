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
  function wheel(event: WheelEvent) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
    zoom({ factor: Math.exp(-event.deltaY * unit * 0.01), x: event.clientX, y: event.clientY, targetX: event.clientX, targetY: event.clientY });
  }
  function touch(event: TouchEvent) {
    if (event.touches.length !== 2) { pinch = undefined; return; }
    event.preventDefault();
    const first = event.touches[0]!;
    const second = event.touches[1]!;
    const next = {
      distance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
      x: (first.clientX + second.clientX) / 2,
      y: (first.clientY + second.clientY) / 2,
    };
    if (pinch !== undefined && pinch.distance > 0) zoom({ factor: next.distance / pinch.distance, x: pinch.x, y: pinch.y, targetX: next.x, targetY: next.y });
    pinch = next;
  }
  function end() { pinch = undefined; }
  element.addEventListener('wheel', wheel, { passive: false });
  element.addEventListener('touchstart', touch, { passive: false });
  element.addEventListener('touchmove', touch, { passive: false });
  element.addEventListener('touchend', end);
  element.addEventListener('touchcancel', end);
  return { destroy() {
    element.removeEventListener('wheel', wheel);
    element.removeEventListener('touchstart', touch);
    element.removeEventListener('touchmove', touch);
    element.removeEventListener('touchend', end);
    element.removeEventListener('touchcancel', end);
  } };
}
