import type { PresentationArtifact } from './artifact.ts';
import type {
  PresentationDocument,
  PresentationSlide,
  SlideObject,
  SlideTextRun,
} from './model.ts';
import type { NativeSlide, NativeSlideTemplate, NativeLayoutContext } from './native-document.ts';
import { applyPresentationLayout, type PresentationLayout } from './authoring-layout.ts';
import { insertSlide } from './authoring-slides.ts';
import { newSlideLayout } from './new-slide-layout.ts';
import {
  presentationRunDefaults,
  presentationRunAuthored,
  presentationParagraphAuthored,
  presentationTextLevels,
  presentationLineReduction,
  presentationRunFonts,
  presentationNativeFonts,
  presentationThemeColours,
  presentationInheritedBackground,
} from './reader.ts';
import { THEME_COLOR_SLOTS } from '@tumblerjs/ooxml';

/** Compile donor layouts during import; insertion never resolves XML or exports a package. */
export function compileNativeSlides(artifact: PresentationArtifact): NativeSlide[] {
  const nativeRun = (run: SlideTextRun): SlideTextRun => {
    const inherited = presentationRunDefaults(run);
    if (!inherited) return run;
    const { text, ...defaults } = inherited;
    const authored = presentationRunAuthored(run);
    const inheritedAuthored = presentationRunAuthored(inherited);
    return {
      ...run,
      nativeFonts: presentationRunFonts(run),
      nativeDefaults: {
        ...defaults,
        nativeFonts: presentationRunFonts(inherited),
        nativeAuthored: inheritedAuthored?.fields,
        nativeOwnFonts: inheritedAuthored?.fonts,
        nativeOwnLanguage: inheritedAuthored?.language,
      },
      nativeAuthored: authored?.fields,
      nativeOwnFonts: authored?.fonts,
      nativeOwnLanguage: authored?.language,
    };
  };
  const nativeParagraph = (paragraph: import('./model.ts').SlideParagraph) => ({
    ...paragraph,
    nativeAuthored: presentationParagraphAuthored(paragraph),
    runs: paragraph.runs.map(nativeRun),
    ...(paragraph.endRun ? { endRun: nativeRun(paragraph.endRun) } : {}),
  });
  const nativeText = (text: SlideObject['text']) =>
    text && {
      ...text,
      nativeLineReduction: presentationLineReduction(text),
      paragraphs: text.paragraphs.map(nativeParagraph),
      nativeLevels: presentationTextLevels(text)?.map(nativeParagraph),
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
    const common = doc.sources
      .get(original.part)
      ?.root.children.find((element) => element.kind === 'element' && element.localName === 'cSld');
    return {
      backgroundOverride:
        common?.kind === 'element' &&
        common.children.some((element) => element.kind === 'element' && element.localName === 'bg'),
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
  const contexts = new Map<string, NativeLayoutContext>();
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
    let context = layout.masterPart ? contexts.get(layout.masterPart) : undefined;
    if (layout.masterPart && !context) {
      const sample = insertSlide(artifact, 0, undefined, slide.id),
        sampleId = sample.document.slides[0]!.id;
      const existing: PresentationLayout[] = [];
      const compileAuthored = (kind: PresentationLayout) => {
        const changed = applyPresentationLayout(sample, sampleId, kind);
        const part = newSlideLayout(changed, sampleId).currentPart!;
        const markup = new TextDecoder().decode(
          changed.document.package.readPart(changed.document.package.getPart(part)!),
        );
        if (
          artifact.document.package
            .relationships(artifact.document.package.getPart(layout.masterPart!)!.name)
            .items.some(
              (rel) =>
                rel.type.endsWith('/slideLayout') &&
                rel.targetMode === 'Internal' &&
                new TextDecoder().decode(
                  artifact.document.package.readPart(
                    artifact.document.package.getPart(rel.targetPartName)!,
                  ),
                ) === markup,
            )
        )
          existing.push(kind);
        return compileSlide(changed.document, changed.document.slides[0]!);
      };
      const authored = {
        blank: compileAuthored('blank'),
        title: compileAuthored('title'),
        'title-content': compileAuthored('title-content'),
        'two-content': compileAuthored('two-content'),
      };
      let titleInsertion = authored['title-content'];
      if (layout.hasSecondLayout) {
        const title = applyPresentationLayout(artifact, slide.id, 'title');
        const next = insertSlide(title, 0, undefined, slide.id);
        titleInsertion = compileSlide(next.document, next.document.slides[0]!);
      }
      context = {
        master: layout.masterPart,
        hasSecond: layout.hasSecondLayout,
        existing,
        authored,
        titleInsertion,
      };
      contexts.set(layout.masterPart, context);
    }
    return {
      ...compiled,
      insertion,
      insertionIsTitle: layout.titleLayout,
      insertionLayout: layout.fallback,
      layoutContext: context,
    };
  });
}
