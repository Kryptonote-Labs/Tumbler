import { PartName } from '@tumblerjs/opc';
import type { WordAuthoredImage } from './create-content.ts';
import type { WordDrawing } from './drawings.ts';

export const nativeImageDrawing = (id: number, image: WordAuthoredImage, width: number): WordDrawing => {
      if (![image.width, image.height].every((value) => Number.isFinite(value) && value > 0))
        throw new RangeError('Invalid image dimensions.');
      const floating = image.layout && image.layout !== 'inline';
      return {
        kind: 'image',
        elementId: id,
        placement: floating ? 'anchor' : 'inline',
        widthPoints: Math.round(image.width * 12700) / 12700,
        heightPoints: Math.round(image.height * 12700) / 12700,
        name: `Image ${id}`,
        altText: image.alt ?? '',
        relationshipId: `native-${id}`,
        partName: PartName.parse(
          `/word/media/native-${id}.${image.contentType === 'image/png' ? 'png' : 'jpg'}`,
        ),
        contentType: image.contentType,
        bytes: image.bytes,
        anchor: floating
          ? {
              horizontalRelativeTo: 'column',
              verticalRelativeTo: image.moveWithText === false ? 'page' : 'paragraph',
              horizontalOffsetPoints:
                image.x ??
                (image.alignment === 'center'
                  ? (width - image.width) / 2
                  : image.alignment === 'right'
                    ? width - image.width
                    : 0),
              verticalOffsetPoints: image.y ?? 0,
              wrap: 'none',
              behindDocument: image.layout === 'behind',
              allowOverlap: true,
              distanceTopPoints: 0,
              distanceEndPoints: 0,
              distanceBottomPoints: 0,
              distanceStartPoints: 0,
            }
          : undefined,
      };
    };
