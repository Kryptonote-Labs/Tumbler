import type { WordCanvasContext } from './canvas-paint.ts';
import { wordPictureImageRect, type WordPictureGeometry } from './picture-geometry.ts';

/** Crop in picture coordinates, reflect, then rotate around the unchanged editing frame. */
export function paintWordPicture<Image, Path>(context: WordCanvasContext<Image, Path>, image: Image, picture: WordPictureGeometry, frame: { x: number; y: number; width: number; height: number }): void {
  const rect = wordPictureImageRect(picture);
  context.save();
  context.translate(frame.x + frame.width / 2, frame.y + frame.height / 2);
  context.rotate(picture.rotation * Math.PI / 180);
  context.scale(picture.flipH ? -1 : 1, picture.flipV ? -1 : 1);
  context.translate(-frame.width / 2, -frame.height / 2);
  context.beginPath();
  context.rect(0, 0, frame.width, frame.height);
  context.clip();
  context.drawImage(image, rect.x * frame.width, rect.y * frame.height, rect.width * frame.width, rect.height * frame.height);
  context.restore();
}
