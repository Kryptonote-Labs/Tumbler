import type { PresentationArtifact } from './artifact.ts';
import type { PresentationDocument, PresentationSlide, SlideObject } from './model.ts';
import type { NativeSlide, NativeSlideTemplate } from './native-document.ts';
import { insertSlide } from './authoring-slides.ts';
import { newSlideLayout } from './new-slide-layout.ts';
import {
  presentationRunDefaults,
  presentationRunFonts,
  presentationNativeFonts,
  presentationThemeColours,
  presentationInheritedBackground,
} from './reader.ts';
import { THEME_COLOR_SLOTS } from '@tumblerjs/ooxml';

/** Compile donor layouts during import; insertion never resolves XML or exports a package. */
export function compileNativeSlides(artifact: PresentationArtifact): NativeSlide[] {
  const nativeText = (text: SlideObject['text']) =>
    text && {
      ...text,
      paragraphs: text.paragraphs.map((p) => ({
        ...p,
        runs: p.runs.map((run) => {
          const inherited = presentationRunDefaults(run);
          if (!inherited) return run;
          const { text, ...nativeDefaults } = inherited;
          return {
            ...run,
            nativeFonts: presentationRunFonts(run),
            nativeDefaults: { ...nativeDefaults, nativeFonts: presentationRunFonts(inherited) },
          };
        }),
        ...(p.endRun
          ? {
              endRun: {
                ...p.endRun,
                nativeFonts: presentationRunFonts(p.endRun),
                nativeDefaults: presentationRunDefaults(p.endRun) ?? p.endRun,
              },
            }
          : {}),
      })),
    };
  const compileSlide = (
    doc: PresentationDocument,
    original: PresentationSlide,
  ): NativeSlideTemplate => {
    const slide = {
      ...original,
      objects: original.objects.map((o) => ({
        ...o,
        text: nativeText(o.text),
        table: o.table && {
          ...o.table,
          cells: o.table.cells.map((c) => ({ ...c, text: nativeText(c.text) })),
        },
      })),
    };
    const scheme = presentationThemeColours(doc, slide.id);
    return {
      slide,
      themeFonts: presentationNativeFonts(doc, original.id),
      fonts: doc.embeddedFonts?.filter((font) =>
        slide.objects.some((o) =>
          [
            ...(o.text?.paragraphs ?? []),
            ...(o.table?.cells.flatMap((c) => c.text?.paragraphs ?? []) ?? []),
          ].some((p) =>
            [...p.runs, ...(p.endRun ? [p.endRun] : [])].some((r) => r.fontFamily === font.family),
          ),
        ),
      ),
      palette: THEME_COLOR_SLOTS.map((slot) => [slot, scheme.color(slot)] as const),
      inheritedBackground: presentationInheritedBackground(original) ?? {
        background: slide.background,
        backgroundGradient: slide.backgroundGradient,
        backgroundPattern: slide.backgroundPattern,
        backgroundPicture: slide.backgroundPicture,
      },
    };
  };
  const layouts = new Map<string, NativeSlideTemplate>();
  return artifact.document.slides.map((slide) => {
    const compiled = compileSlide(artifact.document, slide);
    if (artifact.document.signed) return compiled;
    const layout = newSlideLayout(artifact, slide.id),
      key = `${layout.part ?? ''}:${layout.fallback ?? ''}`;
    let insertion = layouts.get(key);
    if (!insertion) {
      const sample = insertSlide(artifact, 0, undefined, slide.id);
      insertion = compileSlide(sample.document, sample.document.slides[0]!);
      layouts.set(key, insertion);
    }
    return { ...compiled, insertion };
  });
}
