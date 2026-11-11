export interface DrawingPictureFill {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly crop: readonly [number, number, number, number];
  readonly opacity?: number;
  readonly dpi?: number;
  readonly stretch?: readonly [number, number, number, number];
  readonly tile?: {
    readonly x: number; readonly y: number; readonly scaleX: number; readonly scaleY: number;
    readonly align: string; readonly flip: string;
  };
}

/** Cropping selects source content; Office retains the image's native tile frame before scaling. */
export function drawingPictureGeometry(picture: DrawingPictureFill, width: number, height: number, natural: { readonly width: number; readonly height: number }) {
  const [l, t, r, b] = picture.crop, sourceWidth = 1 - l - r, sourceHeight = 1 - t - b;
  if (![width, height, natural.width, natural.height, ...picture.crop].every(Number.isFinite) || Math.min(width, height, natural.width, natural.height, sourceWidth, sourceHeight) <= 0) return undefined;
  // MS-OI29500 2.1.1288 references 2.1.1601: Office ignores blipFill.dpi.
  const tile = picture.tile;
  const w = tile ? natural.width * Math.abs(tile.scaleX) : width;
  const h = tile ? natural.height * Math.abs(tile.scaleY) : height;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return undefined;
  const x = tile ? tile.x + (['r', 'tr', 'br'].includes(tile.align) ? width - w : ['ctr', 't', 'b'].includes(tile.align) ? (width - w) / 2 : 0) : 0;
  const y = tile ? tile.y + (['b', 'bl', 'br'].includes(tile.align) ? height - h : ['ctr', 'l', 'r'].includes(tile.align) ? (height - h) / 2 : 0) : 0;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const [fl, ft, fr, fb] = tile ? [0, 0, 0, 0] : picture.stretch ?? [0, 0, 0, 0];
  const destination = { x: fl! * w, y: ft! * h, width: (1 - fl! - fr!) * w, height: (1 - ft! - fb!) * h };
  if (!Object.values(destination).every(Number.isFinite) || destination.width <= 0 || destination.height <= 0) return undefined;
  const imageWidth = destination.width / sourceWidth, imageHeight = destination.height / sourceHeight;
  const flipX = tile?.flip === 'x' || tile?.flip === 'xy', flipY = tile?.flip === 'y' || tile?.flip === 'xy';
  const periodX = w * (flipX ? 2 : 1), periodY = h * (flipY ? 2 : 1);
  return { x: tile ? ((x % periodX) + periodX) % periodX : x, y: tile ? ((y % periodY) + periodY) % periodY : y, width: w, height: h, destination,
    image: { x: -l * imageWidth, y: -t * imageHeight, width: imageWidth, height: imageHeight },
    flipX, flipY,
    reverseX: (tile?.scaleX ?? 1) < 0, reverseY: (tile?.scaleY ?? 1) < 0,
  };
}

export interface DrawingPictureCanvasContext<Path, Image> {
  globalAlpha: number;
  save(): void; restore(): void;
  translate(x: number, y: number): void; scale(x: number, y: number): void;
  beginPath(): void; rect(x: number, y: number, width: number, height: number): void; clip(path?: Path): void;
  drawImage(image: Image, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
}

/** Paints a resolved embedded image into the current transform without fetching or decoding it. */
export function paintDrawingPicture<Path, Image>(context: DrawingPictureCanvasContext<Path, Image>, picture: DrawingPictureFill, width: number, height: number,
  decoded: { readonly image: Image; readonly width: number; readonly height: number }, maximumTiles = 100_000): void {
  const geometry = drawingPictureGeometry(picture, width, height, decoded);
  if (!geometry) return;
  const { x, y, width: w, height: h, destination, flipX, flipY, reverseX, reverseY } = geometry;
  const firstColumn = picture.tile ? Math.floor(-x / w) : 0, lastColumn = picture.tile ? Math.ceil((width - x) / w) : 1;
  const firstRow = picture.tile ? Math.floor(-y / h) : 0, lastRow = picture.tile ? Math.ceil((height - y) / h) : 1;
  if ((lastColumn - firstColumn) * (lastRow - firstRow) > maximumTiles) throw new RangeError('Picture tiling exceeds the canvas preview budget.');
  const [l, t, r, b] = picture.crop;
  context.save();
  try {
    context.beginPath(); context.rect(0, 0, width, height); context.clip();
    context.globalAlpha *= picture.opacity ?? 1;
    for (let row = firstRow; row < lastRow; row++) for (let column = firstColumn; column < lastColumn; column++) {
      const mirroredX = reverseX !== (flipX && Math.abs(column % 2) === 1), mirroredY = reverseY !== (flipY && Math.abs(row % 2) === 1);
      context.save();
      try {
        context.translate(x + column * w + (mirroredX ? w : 0), y + row * h + (mirroredY ? h : 0));
        context.scale(mirroredX ? -1 : 1, mirroredY ? -1 : 1);
        context.drawImage(decoded.image, decoded.width * l, decoded.height * t, decoded.width * (1 - l - r), decoded.height * (1 - t - b), destination.x, destination.y, destination.width, destination.height);
      } finally { context.restore(); }
    }
  } finally { context.restore(); }
}
