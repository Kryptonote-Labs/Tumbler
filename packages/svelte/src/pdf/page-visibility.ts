/** Prepare a bounded window ahead of the scroll container, including after viewport resizes. */
export function observePdfPageVisibility(element: Element, viewport: HTMLElement, changed: (visible: boolean) => void) {
  let observer: IntersectionObserver | undefined;
  let margin = -1, visible: boolean | undefined;
  const observe = () => {
    const next = Math.max(600, Math.ceil(viewport.clientHeight * 2));
    if (observer && next === margin) return;
    margin = next;
    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      const next = entries.some((entry) => entry.isIntersecting);
      if (next !== visible) { visible = next; changed(next); }
    }, { root: viewport, rootMargin: `${margin}px 0px` });
    observer.observe(element);
  };
  const resize = new ResizeObserver(observe);
  resize.observe(viewport);
  observe();
  return () => { observer?.disconnect(); resize.disconnect(); };
}
