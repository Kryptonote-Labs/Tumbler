import type { BackgroundFill } from './background-authoring.ts';
import type { NativeLayoutContext, NativeSlide, NativeSlideTemplate } from './native-document.ts';
import { nativeColour, nativeGradient } from './native-shape.ts';

const empty = {
  backgroundGradient: undefined,
  backgroundPattern: undefined,
  backgroundPicture: undefined,
};

export function nativeBackground(
  fill: Exclude<BackgroundFill, { kind: 'inherit' }>,
): NativeSlideTemplate['inheritedBackground'] {
  if (fill.kind === 'solid')
    return { ...empty, background: nativeColour(fill.color, fill.opacity ?? 1) };
  if (fill.kind === 'gradient')
    return { ...empty, background: 'none', backgroundGradient: nativeGradient(fill) };
  if (fill.kind === 'pattern')
    return {
      ...empty,
      background: 'none',
      backgroundPattern: {
        preset: fill.preset,
        foreground: nativeColour(fill.foreground),
        background: nativeColour(fill.background),
      },
    };
  if (fill.kind === 'picture')
    return {
      ...empty,
      background: 'none',
      backgroundPicture: {
        bytes: Uint8Array.from(atob(fill.data), (c) => c.charCodeAt(0)),
        contentType: fill.contentType,
        crop: fill.crop ?? [0, 0, 0, 0],
        opacity: fill.opacity ?? 1,
        ...(fill.tile
          ? {
              tile: {
                ...fill.tile,
                x: fill.tile.x ?? 0,
                y: fill.tile.y ?? 0,
                align: fill.tile.align ?? 'tl',
                flip: fill.tile.flip ?? 'none',
              },
            }
          : {}),
      },
    };
  const exhaustive: never = fill;
  return exhaustive;
}

/** Update the resolved defaults, including layouts that are only used by future slides. */
export function applyNativeBackgroundToAll(slides: readonly NativeSlide[], fill: BackgroundFill) {
  const background = fill.kind === 'inherit' ? undefined : nativeBackground(fill);
  const templates = new Map<NativeSlideTemplate, NativeSlideTemplate>();
  const contexts = new Map<NativeLayoutContext, NativeLayoutContext>();

  function update(template: NativeSlideTemplate): NativeSlideTemplate {
    const cached = templates.get(template);
    if (cached) return cached;
    const inheritedBackground = background ?? template.inheritedBackground;
    const next = {
      ...template,
      slide: { ...template.slide, ...empty, ...inheritedBackground },
      inheritedBackground,
      backgroundOverride: false,
    };
    templates.set(template, next);
    return next;
  }

  function updateContext(context: NativeLayoutContext) {
    const cached = contexts.get(context);
    if (cached) return cached;
    const next = {
      ...context,
      titleInsertion: update(context.titleInsertion),
      authored: {
        blank: update(context.authored.blank),
        title: update(context.authored.title),
        'title-content': update(context.authored['title-content']),
        'two-content': update(context.authored['two-content']),
      },
    };
    contexts.set(context, next);
    return next;
  }

  return slides.map((slide) => ({
    ...slide,
    ...update(slide),
    insertion: background && slide.insertion ? update(slide.insertion) : slide.insertion,
    layoutContext: background && slide.layoutContext ? updateContext(slide.layoutContext) : slide.layoutContext,
  }));
}
