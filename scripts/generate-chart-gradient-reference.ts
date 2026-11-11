import { resolve } from 'node:path';
import { beginPackageTransaction } from '../packages/opc/src/index.ts';
import { createOoxmlChart } from '../packages/charts/src/index.ts';
import { createPresentation, openPresentationArtifact, applyPresentationCommand } from '../packages/slides/src/index.ts';

const stops = '<a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst>';
const focus = (l: number, t: number, r: number, b: number) => `<a:fillToRect l="${l}" t="${t}" r="${r}" b="${b}"/>`;
export const gradientReferenceCases = [
  ['linear 45 default', '<a:lin ang="2700000"/>'],
  ['linear 45 scaled', '<a:lin ang="2700000" scaled="1"/>'],
  ['linear 45 unscaled', '<a:lin ang="2700000" scaled="0"/>'],
  ['linear 135 unscaled', '<a:lin ang="8100000" scaled="0"/>'],
  ['circle centre', `<a:path path="circle">${focus(50000, 50000, 50000, 50000)}</a:path>`],
  ['circle inset ellipse', `<a:path path="circle">${focus(25000, 25000, 25000, 25000)}</a:path>`],
  ['circle offset point', `<a:path path="circle">${focus(25000, 20000, 75000, 80000)}</a:path>`],
  ['circle full rectangle', `<a:path path="circle">${focus(0, 0, 0, 0)}</a:path>`],
  ['rect centre', `<a:path path="rect">${focus(50000, 50000, 50000, 50000)}</a:path>`],
  ['rect inset focus', `<a:path path="rect">${focus(25000, 25000, 25000, 25000)}</a:path>`],
  ['rect default focus', '<a:path path="rect"/>'],
  ['rect empty focus', '<a:path path="rect"><a:fillToRect/></a:path>'],
  ['linear half tile', '<a:lin ang="0"/><a:tileRect r="50000"/>'],
  ['linear inset tile', '<a:lin ang="2700000"/><a:tileRect l="25000" t="25000" r="25000" b="25000"/>'],
  ['circle half tile', `<a:path path="circle">${focus(50000, 50000, 50000, 50000)}</a:path><a:tileRect r="50000"/>`],
  ['rect half tile', `<a:path path="rect">${focus(50000, 50000, 50000, 50000)}</a:path><a:tileRect r="50000"/>`],
] as const;
const fill = (shade: string) => `<a:gradFill>${stops}${shade}</a:gradFill>`;
let presentation = createPresentation();
for (const [index, [label, shade]] of gradientReferenceCases.entries()) {
  const page = Math.floor(index / 4), local = index % 4;
  if (index && !local) presentation = applyPresentationCommand(presentation, { name: 'insert-slide', index: page });
  const slideId = presentation.document.slides[page]!.id;
  const x = 40 + local % 2 * 620, y = 80 + Math.floor(local / 2) * 310;
  presentation = applyPresentationCommand(presentation, { name: 'insert-object', slideId, bounds: { x, y: y - 35, width: 570, height: 30 }, object: { kind: 'shape', text: label, fontSize: 18 } });
  presentation = applyPresentationCommand(presentation, { name: 'insert-object', slideId, bounds: { x, y, width: 260, height: 160 }, object: { kind: 'shape', geometry: 'rect', fill: '#FEDCBA', stroke: 'none' } });
  const xml = new TextDecoder().decode(createOoxmlChart({ type: 'barChart', categories: ['A'], series: [{ name: 'Gradient', values: [4] }] }));
  const painted = xml.replace(/<c:spPr>[\s\S]*?<\/c:spPr>/, `<c:spPr>${fill(shade)}<a:ln w="63500">${fill(shade)}</a:ln></c:spPr>`);
  presentation = applyPresentationCommand(presentation, { name: 'insert-chart', slideId, bounds: { x: x + 280, y, width: 300, height: 220 }, content: { xml: painted } });
}
const pkg = presentation.document.package, edit = beginPackageTransaction(pkg);
for (const [page, slide] of presentation.document.slides.entries()) {
  const part = pkg.getPart(slide.part)!;
  let local = 0;
  const source = new TextDecoder().decode(pkg.readPart(part)).replace(/<a:solidFill><a:srgbClr val="FEDCBA"\/><\/a:solidFill>/g, () => fill(gradientReferenceCases[page * 4 + local++]![1]));
  if (local !== 4) throw Error(`Expected four reference rectangles on page ${page + 1}.`);
  edit.replacePart(part.name, new TextEncoder().encode(source));
}
const output = resolve(process.argv[2] ?? 'packages/charts/test/fixtures/chart-gradient-reference.pptx');
await Bun.write(output, openPresentationArtifact(edit.commit()).bytes());
console.log(output);
