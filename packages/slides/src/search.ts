import { findTextMatches, type TextSearchOptions } from '@tumblerjs/core';
import {
  presentationTextTarget,
  slideTextValue,
  type PresentationTableCellAddress,
  type PresentationTextRange,
} from './editing.ts';
import type { PresentationDocument } from './model.ts';

export interface PresentationSearchMatch extends PresentationTextRange {
  readonly slideId: string;
  readonly objectKey: string;
  readonly cell?: PresentationTableCellAddress;
  readonly editable: boolean;
}

/** Find individual occurrences in slide text and table cells, using editable UTF-16 offsets. */
export function findPresentationMatches(
  document: PresentationDocument,
  query: string,
  options: TextSearchOptions = {},
): PresentationSearchMatch[] {
  return document.slides.flatMap((slide) =>
    slide.objects.flatMap((object) => {
      const targets = object.table
        ? object.table.cells.map((cell) => ({
            target: presentationTextTarget(object, cell),
            cell: { row: cell.row, column: cell.column },
          }))
        : [{ target: object, cell: undefined }];
      return targets.flatMap(({ target, cell }) =>
        findTextMatches(slideTextValue(target), query, options).map((range) => ({
          slideId: slide.id,
          objectKey: object.key,
          ...(cell ? { cell } : {}),
          ...range,
          editable: target.textEditable,
        })),
      );
    }),
  );
}
