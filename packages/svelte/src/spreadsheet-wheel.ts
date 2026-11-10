/** Combine wheel input until the next paint without losing distance or direction. */
export function spreadsheetWheelScroll(
  scroll: (x: number, y: number) => void,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (id: number) => void = cancelAnimationFrame,
) {
  let frame: number | undefined;
  let x = 0;
  let y = 0;
  const cancel = () => {
    if (frame !== undefined) cancelFrame(frame);
    frame = undefined;
    x = 0;
    y = 0;
  };
  return {
    add(deltaX: number, deltaY: number) {
      x += deltaX;
      y += deltaY;
      if (frame !== undefined) return;
      frame = requestFrame(() => {
        const left = x;
        const top = y;
        frame = undefined;
        x = 0;
        y = 0;
        scroll(left, top);
      });
    },
    cancel,
  };
}
