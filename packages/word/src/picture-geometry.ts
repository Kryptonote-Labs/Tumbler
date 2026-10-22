import type { LosslessXmlElement } from '@tumblerjs/ooxml';

/** Crop offsets are fractions of the source image; rotation is clockwise in degrees. */
export interface WordPictureGeometry {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly rotation: number;
  readonly flipH: boolean;
  readonly flipV: boolean;
}

const child = (node: LosslessXmlElement | undefined, ns: string, name: string) => node?.children.find((n): n is LosslessXmlElement => n.kind === 'element' && n.namespaceUri === ns && n.localName === name);
const attr = (node: LosslessXmlElement | undefined, name: string) => node?.attributes.find(a => a.namespaceUri === '' && a.localName === name)?.value;

/** Return a diagnostic instead of silently discarding unsupported picture geometry. */
export function readWordPictureGeometry(data: LosslessXmlElement, ns: string, width: number, height: number): WordPictureGeometry | string | undefined {
  const picNs = ns.replace(/\/main$/, '/picture');
  const picture = child(data, picNs, 'pic');
  if (!picture) return 'Only standalone DrawingML pictures are supported.';
  const fill = child(picture, picNs, 'blipFill');
  const props = child(picture, picNs, 'spPr');
  const transform = child(props, ns, 'xfrm');
  const crop = child(fill, ns, 'srcRect');
  const percentage = (name: string) => {
    const raw = attr(crop, name) ?? '0';
    return /^[+-]?\d+$/.test(raw) ? Number(raw) / 100000 : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(raw) ? Number(raw.slice(0, -1)) / 100 : NaN;
  };
  const left = percentage('l'), top = percentage('t'), right = percentage('r'), bottom = percentage('b');
  const rawRotation = attr(transform, 'rot') ?? '0';
  const rotation = /^[+-]?\d+$/.test(rawRotation) ? Number(rawRotation) / 60000 : NaN;
  const boolean = (name: string) => {
    const value = attr(transform, name) ?? '0';
    return value === '1' || value === 'true' ? true : value === '0' || value === 'false' ? false : undefined;
  };
  const flipH = boolean('flipH'), flipV = boolean('flipV');
  if (![left, top, right, bottom, rotation].every(Number.isFinite) || left + right >= 1 || top + bottom >= 1 || flipH === undefined || flipV === undefined)
    return 'Picture crop or transform is invalid or has an empty source rectangle.';
  const fillRect = child(child(fill, ns, 'stretch'), ns, 'fillRect');
  if (child(fill, ns, 'tile') || ['l', 't', 'r', 'b'].some(name => !['0', '0%', undefined].includes(attr(fillRect, name))))
    return 'Tiled pictures and non-default fill rectangles are retained but not rendered.';
  const preset = attr(child(props, ns, 'prstGeom'), 'prst');
  if (child(props, ns, 'custGeom') || preset !== undefined && preset !== 'rect')
    return 'Nonrectangular picture masks are retained but not rendered.';
  if (rotation !== 0 && ['0', 'false'].includes(attr(fill, 'rotWithShape') ?? ''))
    return 'Picture fills that do not rotate with their shape are retained but not rendered.';
  // Different local extents need a separate layout/resize model. Never guess their geometry.
  const extent = child(transform, ns, 'ext');
  if (extent && (Number(attr(extent, 'cx')) !== Math.round(width * 12700) || Number(attr(extent, 'cy')) !== Math.round(height * 12700)))
    return 'Pictures with local extents different from the drawing frame are retained but not rendered.';
  if (left === 0 && top === 0 && right === 0 && bottom === 0 && rotation === 0 && !flipH && !flipV) return undefined;
  return Object.freeze({ left, top, right, bottom, rotation: rotation % 360, flipH, flipV });
}

/** Full-image destination within the clipped picture frame, in frame-relative units. */
export function wordPictureImageRect(picture: WordPictureGeometry) {
  const width = 1 / (1 - picture.left - picture.right), height = 1 / (1 - picture.top - picture.bottom);
  return { x: -picture.left * width, y: -picture.top * height, width, height };
}
