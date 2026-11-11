import { PartName } from '@tumblerjs/opc';
import type { WordAuthoredImage } from './create-content.ts';
import type { WordImageDrawing } from './drawings.ts';
import { nativeDrawingGeometry } from './native-drawing.ts';

export const nativeImageDrawing = (id: number, image: WordAuthoredImage, width: number, partName?: WordImageDrawing['partName']): WordImageDrawing => ({
  ...nativeDrawingGeometry(id, image, width, 'Image'), kind: 'image', relationshipId: `native-${id}`,
  partName: partName ?? PartName.parse(`/word/media/native-${id}.${image.contentType === 'image/png' ? 'png' : 'jpg'}`),
  contentType: image.contentType, bytes: image.bytes,
});
