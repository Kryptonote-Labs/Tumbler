import {
  presentationTextTarget,
  slideTextValue,
  type PresentationSlide,
  type PresentationTableCellAddress,
  type PresentationTextRange,
} from '@tumblerjs/slides';
import { presentationTextPosition } from './presentation-text-position.ts';

export interface PresentationTextLocation extends PresentationTextRange {
  slideId: string;
  objectKey: string;
  cell?: PresentationTableCellAddress;
}

/** Resolve document offsets against the rendered text body, excluding bullets and prompts. */
export function presentationTextRange(
  node: HTMLElement,
  slide: PresentationSlide,
  location: PresentationTextLocation,
  expectedText?: string,
) {
  if (location.slideId !== slide.id) return;
  const object = slide.objects.find((object) => object.key === location.objectKey);
  if (!object) return;
  const address = location.cell;
  if (
    address &&
    !object.table?.cells.some((cell) => cell.row === address.row && cell.column === address.column)
  )
    return;
  const text = slideTextValue(presentationTextTarget(object, location.cell));
  if (
    !Number.isInteger(location.start) ||
    !Number.isInteger(location.end) ||
    location.start < 0 ||
    location.end < location.start ||
    location.end > text.length ||
    (expectedText !== undefined && text.slice(location.start, location.end) !== expectedText)
  )
    return;
  const element = Array.from(node.querySelectorAll<SVGElement>('[data-slide-object]')).find(
    (element) => element.dataset.slideObject === location.objectKey,
  );
  const cell = location.cell;
  const root = cell
    ? Array.from(element?.querySelectorAll<SVGElement>('[data-table-cell]') ?? []).find(
        (element) => element.dataset.tableCell === `${cell.row}:${cell.column}`,
      )
    : element;
  const paragraphs = root?.querySelector<HTMLElement>('.paragraphs');
  if (!paragraphs) return;
  const range = document.createRange();
  range.setStart(...presentationTextPosition(paragraphs, text.split('\n'), location.start));
  range.setEnd(...presentationTextPosition(paragraphs, text.split('\n'), location.end));
  return { root: paragraphs, range };
}
