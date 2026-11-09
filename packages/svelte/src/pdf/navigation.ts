import {
  PdfNavigation,
  pdfModelLinks,
  type PdfTextModel,
  isSafePdfUri,
  type PdfDocument,
  type PdfPage,
  type PdfLinkTarget,
  type PdfDestination,
} from '@tumblerjs/pdf';

type Page = { source: PdfPage; rotation: number; continuation?: number };
export type PdfNavigationOptions = {
  document: PdfDocument;
  pages: readonly Page[];
  scale: number;
  editable?: boolean;
  model?: PdfTextModel;
};

function rotate(x: number, y: number, page: Page) {
  switch (page.rotation) {
    case 90:
      return { x: page.source.height - y, y: x };
    case 180:
      return { x: page.source.width - x, y: page.source.height - y };
    case 270:
      return { x: y, y: page.source.width - x };
    default:
      return { x, y };
  }
}
export function scrollPdfDestination(
  root: HTMLElement | undefined,
  target: PdfDestination,
  options: PdfNavigationOptions,
) {
  const index = options.pages.findIndex(
    (page) => page.source.id === target.pageId && !page.continuation,
  );
  const page = options.pages[index];
  const element = root?.querySelector<HTMLElement>(`[data-pdf-page="${index + 1}"]`);
  if (!page || !element) return;
  element.scrollIntoView({ block: 'start', inline: 'nearest' });
  let viewport = root?.parentElement;
  while (viewport && !/(auto|scroll)/.test(getComputedStyle(viewport).overflowY))
    viewport = viewport.parentElement;
  if (!viewport) return;
  const point = rotate(target.x, target.y, page),
    bounds = element.getBoundingClientRect(),
    box = viewport.getBoundingClientRect();
  viewport.scrollTop += bounds.top - box.top + point.y * options.scale;
  viewport.scrollLeft += bounds.left - box.left + point.x * options.scale;
}

/** Hit testing leaves the text layer untouched. Capture only a click that will follow a link. */
export function pdfNavigation(root: HTMLElement, initial: PdfNavigationOptions) {
  let options = initial,
    navigation = new PdfNavigation(options.document);
  let down: { x: number; y: number; target: PdfLinkTarget } | undefined;
  let point: { clientX: number; clientY: number; target: EventTarget | null } | undefined;
  let modifier = false;
  function hit(event: { clientX: number; clientY: number; target: EventTarget | null }) {
    const element =
      event.target instanceof Element ? event.target.closest<HTMLElement>('[data-pdf-page]') : null;
    const page = options.pages[Number(element?.dataset.pdfPage) - 1];
    if (!element || !page || page.continuation) return;
    const bounds = element.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / options.scale,
      y = (event.clientY - bounds.top) / options.scale;
    const links = options.model ? pdfModelLinks(options.document, options.model, page.source) : navigation.links(page.source);
    return links.find((link) => {
      const a = rotate(link.rect[0], link.rect[1], page),
        b = rotate(link.rect[2], link.rect[3], page);
      return (
        x >= Math.min(a.x, b.x) &&
        x <= Math.max(a.x, b.x) &&
        y >= Math.min(a.y, b.y) &&
        y <= Math.max(a.y, b.y)
      );
    })?.target;
  }
  function allowed(target: PdfLinkTarget | undefined) {
    return (
      target &&
      (target.kind === 'external'
        ? isSafePdfUri(target.uri)
        : options.pages.some((p) => p.source.id === target.pageId))
    );
  }
  function hover() {
    const target = point && hit(point);
    if (!allowed(target)) {
      root.removeAttribute('title');
      root.style.removeProperty('--pdf-link-cursor');
      return;
    }
    const label = target!.kind === 'external' ? target!.uri : 'Go to page';
    root.title = options.editable
      ? `${label}\n${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}+Click to follow link`
      : label;
    root.style.setProperty('--pdf-link-cursor', !options.editable || modifier ? 'pointer' : 'text');
  }
  function move(event: PointerEvent) {
    point = event.buttons ? undefined : event;
    modifier = event.ctrlKey || event.metaKey;
    hover();
  }
  function leave() {
    point = undefined;
    hover();
  }
  function key(event: KeyboardEvent) {
    modifier = event.ctrlKey || event.metaKey;
    hover();
  }
  function start(event: PointerEvent) {
    down = undefined;
    if (
      event.button !== 0 ||
      event.altKey ||
      event.shiftKey ||
      (options.editable && !event.ctrlKey && !event.metaKey)
    )
      return;
    const target = hit(event);
    if (!allowed(target) || !target) return;
    down = { x: event.clientX, y: event.clientY, target };
    // Prevent Home's text-box pointer handler from starting an edit or moving selection.
    if (options.editable) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function click(event: MouseEvent) {
    const pending = down;
    down = undefined;
    if (
      !pending ||
      Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 4 ||
      !allowed(pending.target)
    )
      return;
    if (!options.editable && !window.getSelection()?.isCollapsed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pending.target.kind === 'external')
      window.open(pending.target.uri, '_blank', 'noopener,noreferrer');
    else scrollPdfDestination(root, pending.target, options);
  }
  root.addEventListener('pointerdown', start, true);
  root.addEventListener('click', click, true);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerleave', leave);
  window.addEventListener('keydown', key);
  window.addEventListener('keyup', key);
  return {
    update(next: PdfNavigationOptions) {
      options = next;
      navigation = new PdfNavigation(next.document);
      leave();
    },
    destroy() {
      root.removeEventListener('pointerdown', start, true);
      root.removeEventListener('click', click, true);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', leave);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', key);
      leave();
    },
  };
}
