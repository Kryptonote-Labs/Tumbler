/** Prepare a bounded window ahead of the scroll container, including after viewport resizes. */
export function observePdfPageVisibility(
  element: Element,
  viewport: HTMLElement | null,
  changed: (visible: boolean) => void,
) {
  const document = element.ownerDocument;
  const root =
    viewport === document.documentElement || viewport === document.scrollingElement
      ? null
      : viewport;
  const sizing = root ?? document.documentElement;
  let observer: IntersectionObserver | undefined;
  let margin = -1,
    visible: boolean | undefined;
  const observe = () => {
    const next = Math.max(600, Math.ceil(sizing.clientHeight * 2));
    if (observer && next === margin) return;
    margin = next;
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        const next = entries.some((entry) => entry.isIntersecting);
        if (next !== visible) {
          visible = next;
          changed(next);
        }
      },
      { root, rootMargin: `${margin}px 0px` },
    );
    observer.observe(element);
  };
  const resize = new ResizeObserver(observe);
  resize.observe(sizing);
  if (!root) document.defaultView?.addEventListener("resize", observe);
  observe();
  return () => {
    observer?.disconnect();
    resize.disconnect();
    if (!root) document.defaultView?.removeEventListener("resize", observe);
  };
}
