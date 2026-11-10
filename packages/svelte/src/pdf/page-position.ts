type Position = { index: number; oncurrent?: (index: number) => void };

/** Track the page crossing the viewport's middle, independently of raster preparation. */
export function pdfPagePosition(element: HTMLElement, options: Position) {
  let root = element.parentElement;
  while (root && !/(auto|scroll)/.test(getComputedStyle(root).overflowY))
    root = root.parentElement;
  let observer: IntersectionObserver | undefined;
  let current = false;
  const observe = () => {
    observer?.disconnect();
    const margin = Math.floor((root?.clientHeight ?? window.innerHeight) * 0.45);
    observer = new IntersectionObserver((entries) => {
      current = entries.some((entry) => entry.isIntersecting);
      if (current) options.oncurrent?.(options.index);
    }, { root, rootMargin: `-${margin}px 0px -${margin}px 0px` });
    observer.observe(element);
  };
  const resize = new ResizeObserver(observe);
  resize.observe(root ?? document.documentElement);
  observe();
  return {
    update(next: Position) {
      const moved = next.index !== options.index;
      options = next;
      if (moved && current) options.oncurrent?.(options.index);
    },
    destroy() { observer?.disconnect(); resize.disconnect(); },
  };
}
