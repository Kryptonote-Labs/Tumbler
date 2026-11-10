import type { PdfTextModel } from './model.ts';
import { pdfSourceKey } from './import-text.ts';
import { inverse, multiply, type PdfMatrix } from '../matrix.ts';
import type { PdfPageScene } from '../scene.ts';

export type PdfScenePlacement = { source: string; x: number; y: number };
/** Serializable source translations, shared by interactive and worker renderers. */
export function pdfScenePlacements(model: PdfTextModel, page: number): PdfScenePlacement[] {
  return model.ids(page).flatMap((id) => {
    if (!model.sourcePreserved(id)) return [];
    const seed = model.seed(id), frame = model.geometry(id);
    return seed.sources.map((source) => ({
      source: `${source.instance}/${source.object}/${source.start}`,
      x: frame.x - seed.x, y: frame.y - seed.y,
    }));
  });
}
/** Translate source glyphs in viewport coordinates without changing their font, paint or orientation. */
export function placePdfScene(scene: PdfPageScene, model: PdfTextModel): PdfPageScene {
  return placePdfSceneSources(scene, pdfScenePlacements(model, scene.page.index));
}
export function placePdfSceneSources(scene: PdfPageScene, placements: readonly PdfScenePlacement[]): PdfPageScene {
  const m = inverse(scene.viewport);
  const targets = new Map<string, PdfMatrix>(placements.map(({source,x,y}) => [
    source, [1, 0, 0, 1, m[0] * x + m[2] * y, m[1] * x + m[3] * y],
  ]));
  const procedures = new Map<string, (typeof scene.elements)[number]['source']>();
  scene.elements.forEach((e, index) => {
    if (e.kind === 'glyph' && e.glyph.procedure)
      procedures.set(`${e.source.instance}:glyph:${e.glyph.code}:${index + 1}`, e.source);
  });
  return {
    ...scene,
    elements: scene.elements.map((e) => {
      let instance = e.source.instance;
      let owner = procedures.get(instance);
      // A Type3 CharProc can paint through arbitrarily nested Form instances.
      while (!owner && instance.includes(':form:')) {
        instance = instance.slice(0, instance.lastIndexOf(':form:'));
        owner = procedures.get(instance);
      }
      const source = owner ?? e.source;
      const translation = targets.get(pdfSourceKey(source));
      if (!translation) return owner ? { ...e, source } : e;
      const state = { ...e.state, transform: multiply(translation, e.state.transform) };
      if (e.kind === 'path')
        return {
          ...e,
          source,
          state,
          path: e.path.map((command) =>
            command.transform
              ? { ...command, transform: multiply(translation, command.transform) }
              : command,
          ),
        };
      return { ...e, source, state };
    }),
  };
}
