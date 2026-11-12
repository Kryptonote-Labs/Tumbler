import type { ChartMark, ChartScene } from '@tumblerjs/charts';

/** Chart families are CSS stacks; resolve the authored first family, preserving generic stacks. */
export function wordChartFontFamily(stack: string, resolve?: (name: string) => string): string {
  if (!resolve) return stack;
  const quoted = /^("(?:[^"\\]|\\.)*")/.exec(stack);
  const name = quoted ? JSON.parse(quoted[1]!) as string : stack.split(',')[0]!.trim();
  return /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/.test(name) ? stack : resolve(name);
}

/** Chart layout passes CSS font shorthands to its measuring callback. */
export function wordChartFont(font: string, resolve?: (name: string) => string): string {
  return font.replace(/^(.*?px\s+)(.+)$/, (_, prefix: string, stack: string) => prefix + wordChartFontFamily(stack, resolve));
}

/** Keep nested chart groups and their measuring callback on the same document faces. */
export function wordChartSceneFonts(scene: ChartScene, resolve?: (name: string) => string): ChartScene {
  if (!resolve) return scene;
  const visit = (marks: readonly ChartMark[]): ChartMark[] => marks.map(mark =>
    mark.kind === 'text' ? { ...mark, font: { ...mark.font, family: wordChartFontFamily(mark.font.family, resolve) } }
      : mark.kind === 'group' ? { ...mark, marks: visit(mark.marks) } : mark);
  return { ...scene, marks: visit(scene.marks) };
}
