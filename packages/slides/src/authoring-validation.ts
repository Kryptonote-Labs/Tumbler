import { normalizeFormattingPatch, type FormattingPatch } from '@tumblerjs/core';
import type { PresentationShapeStyle } from './editing.ts';
import { PresentationError, type SlideObject } from './model.ts';

/** Native authoring and lossless export accept the same DrawingML formatting values. */
export function presentationFormattingPatch(patch: FormattingPatch | undefined) {
  const normalized = patch ? normalizeFormattingPatch(patch) : undefined;
  // DrawingML ST_TextFontSize stores hundredths of a point, from 100 to 400000.
  const size = normalized?.text?.fontSize;
  if (
    size &&
    'set' in size &&
    (size.set < 1 ||
      size.set > 4000 ||
      Math.abs(size.set * 100 - Math.round(size.set * 100)) > 1e-7)
  )
    throw new RangeError(
      'Presentation font sizes use hundredth-point steps from 1 to 4000 points.',
    );
  if (normalized?.block?.verticalAlignment)
    throw new RangeError('Vertical alignment is not supported by this text command.');
  return normalized;
}

export function validatePresentationShapeStyle(object: SlideObject, patch: PresentationShapeStyle) {
  if (object.kind !== 'shape' || object.restriction)
    throw new PresentationError('unsupported_edit', 'This shape cannot be formatted.');
  for (const color of [patch.fill, patch.stroke])
    if (typeof color === 'string' && color !== 'none' && !/^#[\da-f]{6}$/i.test(color))
      throw new RangeError('Use a hex colour or none.');
  // DrawingML ST_LineWidth ranges from 0 to 20116800 EMU, or 1584 points.
  if (
    patch.strokeWidth !== undefined &&
    (!Number.isFinite(patch.strokeWidth) || patch.strokeWidth < 0 || patch.strokeWidth > 1584)
  )
    throw new RangeError('DrawingML outline width must be between 0 and 1584 points.');
  if (
    patch.cornerRadius !== undefined &&
    (!Number.isFinite(patch.cornerRadius) || patch.cornerRadius < 0)
  )
    throw new RangeError('Corner radius must be a finite nonnegative number.');
}
