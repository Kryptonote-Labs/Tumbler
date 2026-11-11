import { bindChartImages, chartContentModel, type ChartContent, type ChartModel } from '@tumblerjs/charts';
import type { NativeSlide, NativeSlideTemplate } from './native-document.ts';

/** Chart source remains authoritative when a compiled view was saved by an older renderer. */
export function refreshNativeChartProjection(native: NativeSlide): NativeSlide {
  const models = new WeakMap<ChartContent, ChartModel>();
  const templates = new WeakMap<NativeSlideTemplate, NativeSlideTemplate>();
  function template(current: NativeSlideTemplate): NativeSlideTemplate {
    const cached = templates.get(current);
    if (cached) return cached;
    let changed = false;
    const objects = current.slide.objects.map(object => {
      if (object.kind !== 'chart' || !object.chartContent) return object;
      const content = object.chartContent;
      let parsed = models.get(content);
      if (!parsed) { parsed = chartContentModel(content); models.set(content, parsed); }
      const bound = content.resources === undefined ? bindChartImages(parsed, object.chart?.images) : parsed;
      const theme = { ...(object.chart?.themeColors ? { themeColors: object.chart.themeColors } : {}), ...(object.chart?.themeFonts ? { themeFonts: object.chart.themeFonts } : {}) };
      const chart = { ...bound, ...theme, ...(bound.status === 'supported' && bound.plots ? { plots: bound.plots.map(plot => ({ ...plot, ...theme })) } : {}) };
      changed = true; return { ...object, chart };
    });
    const result = changed ? { ...current, slide: { ...current.slide, objects } } : current;
    templates.set(current, result); return result;
  }
  const main = template(native), insertion = native.insertion && template(native.insertion), context = native.layoutContext;
  let layoutContext = context;
  if (context) {
    const titleInsertion = template(context.titleInsertion);
    const authored = {
      blank: template(context.authored.blank), title: template(context.authored.title),
      'title-content': template(context.authored['title-content']), 'two-content': template(context.authored['two-content']),
    };
    if (titleInsertion !== context.titleInsertion || authored.blank !== context.authored.blank || authored.title !== context.authored.title || authored['title-content'] !== context.authored['title-content'] || authored['two-content'] !== context.authored['two-content']) layoutContext = { ...context, titleInsertion, authored };
  }
  if (main === native && insertion === native.insertion && layoutContext === context) return native;
  return { ...native, ...main, ...(insertion ? { insertion } : {}), ...(layoutContext ? { layoutContext } : {}) };
}
