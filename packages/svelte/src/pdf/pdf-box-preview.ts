/** Page painters supply cached ink layers; pointer movement only changes compositor transforms. */
export type PdfPageDragPreview = {
  begin(ids: readonly string[]): void;
  move(dx: number, dy: number): void;
  finish(cancelled: boolean): void;
};
const painters = new WeakMap<HTMLElement, PdfPageDragPreview>();
export function registerPdfDragPreview(page: HTMLElement, painter: PdfPageDragPreview) {
  painters.set(page, painter);
  return () => painters.delete(page);
}

export function beginPdfBoxPreview(node: HTMLElement, ids: readonly string[]) {
  const root = node.closest('.pdf-editable')!;
  const elements = [
    ...root.querySelectorAll<HTMLElement>('[data-pdf-text-region], [data-pdf-text-box], [data-pdf-image-box]'),
  ].filter((element) =>
    ids.includes(element.dataset.pdfTextRegion ?? element.dataset.pdfTextBox ?? element.dataset.pdfImageBox ?? ''),
  );
  const pages = [...root.querySelectorAll<HTMLElement>('.pdf-page')].flatMap((page) => {
    const painter = painters.get(page);
    return painter ? [painter] : [];
  });
  const previous = elements.map((element) => ({
    element,
    transform: element.style.transform,
    willChange: element.style.willChange,
  }));
  for (const { element } of previous) element.style.willChange = 'transform';
  for (const page of pages) page.begin(ids);
  let frame: number | undefined;
  let dx = 0,
    dy = 0;
  const apply = () => {
    frame = undefined;
    for (const { element } of previous) element.style.transform = `translate(${dx}px, ${dy}px)`;
    for (const page of pages) page.move(dx, dy);
  };
  return {
    move(x: number, y: number) {
      dx = x;
      dy = y;
      if (frame === undefined) frame = requestAnimationFrame(apply);
    },
    finish(cancelled: boolean) {
      if (frame !== undefined) cancelAnimationFrame(frame);
      apply();
      for (const { element, transform, willChange } of previous) {
        element.style.transform = transform;
        element.style.willChange = willChange;
      }
      for (const page of pages) page.finish(cancelled);
    },
  };
}
