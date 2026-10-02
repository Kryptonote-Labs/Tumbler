import type * as Y from 'yjs';

export type DocumentImage = {
  id: string;
  type: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  alt: string;
  layout?: 'inline' | 'front' | 'behind';
  alignment?: 'left' | 'center' | 'right';
  moveWithText?: boolean;
  x?: number;
  y?: number;
};

export function normalizeImage(image: DocumentImage): DocumentImage {
  if ((image.layout ?? 'inline') !== 'inline') return image;
  const { x, y, moveWithText, ...inline } = image;
  return inline;
}

export function isDocumentImage(value: unknown): value is DocumentImage {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'id' in value &&
    typeof value.id === 'string' &&
    /^[\w-]{1,128}$/.test(value.id) &&
    'type' in value &&
    (value.type === 'image/png' || value.type === 'image/jpeg') &&
    'width' in value &&
    typeof value.width === 'number' &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    Number.isSafeInteger(Math.round(value.width * 12700)) &&
    Math.round(value.width * 12700) > 0 &&
    'height' in value &&
    typeof value.height === 'number' &&
    Number.isFinite(value.height) &&
    value.height > 0 &&
    Number.isSafeInteger(Math.round(value.height * 12700)) &&
    Math.round(value.height * 12700) > 0 &&
    'alt' in value &&
    typeof value.alt === 'string' &&
    value.alt.isWellFormed() &&
    // Match XML text rules: tabs, line feeds and carriage returns are valid alt text.
    !/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value.alt) &&
    (!('layout' in value) || ['inline', 'front', 'behind'].includes(String(value.layout))) &&
    (!('alignment' in value) || ['left', 'center', 'right'].includes(String(value.alignment))) &&
    (!('moveWithText' in value) || typeof value.moveWithText === 'boolean') &&
    ['x', 'y'].every(
      (key) =>
        !(key in value) ||
        (typeof Reflect.get(value, key) === 'number' &&
          Number.isFinite(Reflect.get(value, key)) &&
          Number.isSafeInteger(Math.round(Reflect.get(value, key) * 12700))),
    ) &&
    Object.keys(value).every((key) =>
      [
        'id',
        'type',
        'width',
        'height',
        'alt',
        'layout',
        'alignment',
        'moveWithText',
        'x',
        'y',
      ].includes(key),
    )
  );
}
export function documentImageRefs(text: Y.Text) {
  const result = new Map<string, DocumentImage>();
  for (const part of text.toDelta()) {
    const image: unknown = part.attributes?.image;
    if (image !== undefined) {
      if (
        !isDocumentImage(image) ||
        typeof part.insert !== 'string' ||
        !/^\uFFFC+$/.test(part.insert)
      )
        throw new Error('Invalid document image.');
      if (result.has(image.id) && result.get(image.id)!.type !== image.type)
        throw new Error('Image types do not agree.');
      result.set(image.id, image);
    }
  }
  return result;
}

export function imagePositions(text: Y.Text) {
  const result = new Map<number, DocumentImage>();
  let offset = 0;
  for (const part of text.toDelta()) {
    if (typeof part.insert !== 'string') continue;
    if (isDocumentImage(part.attributes?.image))
      for (let i = 0; i < part.insert.length; i++) result.set(offset + i, part.attributes.image);
    offset += part.insert.length;
  }
  return result;
}
