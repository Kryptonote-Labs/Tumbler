import { insertNativeObject, nativeObjectText } from './native-shape.ts';
import type { PresentationSlide, SlideObject } from './model.ts';

/** Office default layout slots are native geometry; applying a layout never creates a temporary PPTX. */
export function nativeLayoutTemplate(
  layout: 'blank' | 'title' | 'title-content' | 'two-content',
  width: number,
  height: number,
): PresentationSlide {
  const title = { role: 'title', x: 0.0688, y: 0.0532, w: 0.8625, h: 0.1933 };
  const slots =
    layout === 'blank'
      ? []
      : layout === 'title'
        ? [
            { role: 'ctrTitle', x: 0.125, y: 0.1637, w: 0.75, h: 0.3481 },
            { role: 'subTitle', x: 0.125, y: 0.5252, w: 0.75, h: 0.2414 },
          ]
        : layout === 'title-content'
          ? [title, { role: 'body', x: 0.0688, y: 0.2662, w: 0.8625, h: 0.6345 }]
          : [
              title,
              { role: 'body', x: 0.0688, y: 0.2662, w: 0.425, h: 0.6345 },
              { role: 'body', x: 0.5063, y: 0.2662, w: 0.425, h: 0.6345 },
            ];
  const objects = slots.map((slot, i): SlideObject => {
    const fontSize =
      slot.role === 'ctrTitle'
        ? 60
        : slot.role === 'subTitle'
          ? 24
          : slot.role === 'title'
            ? 44
            : 28;
    const object = insertNativeObject(
      {
        name: 'insert-object',
        slideId: 'template',
        bounds: {
          x: width * slot.x,
          y: height * slot.y,
          width: width * slot.w,
          height: height * slot.h,
        },
        object: { kind: 'shape', fontSize },
      },
      `template:${i}`,
      `${i + 2}`,
      '/native/template.xml',
    );
    const text = nativeObjectText(
      '',
      fontSize,
      slot.role === 'ctrTitle' || slot.role === 'subTitle',
    );
    return {
      ...object,
      placeholder: slot.role === 'body' ? 'obj' : slot.role,
      text: {
        ...text,
        anchor: slot.role === 'ctrTitle' ? 'bottom' : slot.role === 'title' ? 'center' : 'top',
        paragraphs: text.paragraphs.map((p) =>
          slot.role === 'body'
            ? { ...p, bullet: '•', marginLeft: 24, indent: -24, before: 13.333333333333334 }
            : p,
        ),
      },
    };
  });
  return {
    id: 'template',
    part: '/native/template.xml',
    title: '',
    hidden: false,
    notes: '',
    background: '#FFFFFF',
    backgroundGradient: undefined,
    objects,
    diagnostics: [],
  };
}
