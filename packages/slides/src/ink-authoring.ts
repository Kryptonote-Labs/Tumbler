import {
  authoredOfficeInkXml,
  readOfficeInk,
  createOfficeInkScene,
  renderOfficeInkRaster,
  encodeInkPng,
} from '@tumblerjs/ink';
import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { openPresentationArtifact, type PresentationArtifact } from './artifact.ts';
import { appendToTree, slideTree } from './authoring-objects.ts';
import { editable } from './authoring-slides.ts';
import { emu, R } from './authoring-xml.ts';
import type { PresentationCommand } from './commands.ts';

/** Store editable InkML and an Office-compatible PNG fallback in a single slide object. */
export function insertPresentationInk(
  artifact: PresentationArtifact,
  input: Extract<PresentationCommand, { name: 'insert-ink' }>,
) {
  editable(artifact);
  const points = input.points.map(([x, y, p]) => [x * 0.75, y * 0.75, p] as const);
  const payload = authoredOfficeInkXml([
    { points, color: input.color, size: input.size, highlighter: input.highlighter ?? false },
  ]);
  const ink = readOfficeInk(new TextEncoder().encode(payload));
  const options = { renderingProfile: 'word', maxPoints: Infinity } as const;
  const scene = createOfficeInkScene(ink, options);
  if (!scene.supported) throw new Error(scene.diagnostics.map((d) => d.message).join(' '));
  const { slide, source, tree, id, ns } = slideTree(artifact, input.slideId);
  const bounds = scene.bounds;
  const trace = scene.traceBounds;
  const size = {
    width: Math.max(trace.width, 72 / 2540),
    height: Math.max(trace.height, 72 / 2540),
  };
  for (const n of [
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    trace.x,
    trace.y,
    size.width,
    size.height,
  ])
    if (!Number.isFinite(n) || Math.abs(n * 12700) > 2147483647)
      throw new RangeError('Ink exceeds DrawingML coordinates.');
  // Bound the preview allocation by lowering resolution, without limiting stored samples or dimensions.
  const scale = Math.min(4 / 3, Math.sqrt(1_000_000 / Math.max(1, bounds.width * bounds.height)));
  const raster = renderOfficeInkRaster(ink, { ...options, scale, bounds, maxPixels: Infinity });
  if (!raster.supported) throw new Error(raster.diagnostics.map((d) => d.message).join(' '));
  const tx = beginPackageTransaction(artifact.document.package);
  let n = 1;
  while (
    artifact.document.package.getPart(`/ppt/ink/ink${n}.xml`) ||
    artifact.document.package.getPart(`/ppt/media/ink${n}.png`)
  )
    n++;
  const part = `/ppt/ink/ink${n}.xml`,
    image = `/ppt/media/ink${n}.png`;
  const used = new Set(
    artifact.document.package
      .relationships(artifact.document.package.getPart(slide.part)!.name)
      .items.map((r) => r.id),
  );
  let rel = n;
  while (used.has(`rIdInk${rel}`) || used.has(`rIdInkImage${rel}`)) rel++;
  const relationship =
    artifact.document.conformance === 'strict'
      ? 'http://purl.oclc.org/ooxml/officeDocument/relationships'
      : R;
  tx.addPart(part, 'application/inkml+xml', new TextEncoder().encode(payload))
    .addPart(image, 'image/png', encodeInkPng(raster.width, raster.height, raster.data))
    .addRelationship(slide.part, {
      id: `rIdInk${rel}`,
      type: `${relationship}/customXml`,
      target: part,
    })
    .addRelationship(slide.part, {
      id: `rIdInkImage${rel}`,
      type: `${relationship}/image`,
      target: image,
    });
  const xfrm = (tag: string, x: number, y: number, width: number, height: number) =>
    `<${tag}><a:off x="${emu(x / 0.75)}" y="${emu(y / 0.75)}"/><a:ext cx="${emu(width / 0.75)}" cy="${emu(height / 0.75)}"/></${tag}>`;
  const markup = `<mc:AlternateContent ${ns} xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><mc:Choice Requires="p14"><p:contentPart r:id="rIdInk${rel}"><p14:nvContentPartPr><p14:cNvPr id="${id}" name="Ink ${id}"/><p14:cNvContentPartPr/><p14:nvPr/></p14:nvContentPartPr>${xfrm('p14:xfrm', trace.x, trace.y, size.width, size.height)}</p:contentPart></mc:Choice><mc:Fallback><p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Ink ${id}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdInkImage${rel}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm('a:xfrm', bounds.x, bounds.y, bounds.width, bounds.height)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></mc:Fallback></mc:AlternateContent>`;
  tx.replacePart(slide.part, appendToTree(source, tree, markup));
  return openPresentationArtifact(tx.commit(), artifact.options);
}

/** Refresh the cached image after a native resize so other Office readers see the edited ink. */
export function refreshPresentationInkFallback(
  artifact: PresentationArtifact,
  slideId: string,
  objectKey: string,
) {
  const object = artifact.document.slides
    .find((s) => s.id === slideId)
    ?.objects.find((o) => o.key === objectKey);
  if (!object?.ink) return artifact;
  const { source } = slideTree(artifact, slideId);
  const picture = source.element(object.elementId);
  const find = (node: typeof picture): typeof picture => {
    if (!node) return;
    if (node.localName === 'blip') return node;
    for (const child of node.children)
      if (child.kind === 'element') {
        const found = find(child);
        if (found) return found;
      }
  };
  const rid = find(picture)?.attributes.find((a) => a.localName === 'embed')?.value;
  const part = artifact.document.package.getPart(object.sourcePart)!;
  const relation = rid && artifact.document.package.relationships(part.name).get(rid);
  if (!relation || relation.targetMode !== 'Internal') return artifact;
  const [a, b, c, d, e, f] = object.ink.sampleMatrix;
  const bounds = {
    x: 0,
    y: 0,
    width: object.transform.width * 0.75,
    height: object.transform.height * 0.75,
  };
  const scale = Math.min(4 / 3, Math.sqrt(1_000_000 / Math.max(1, bounds.width * bounds.height)));
  const raster = renderOfficeInkRaster(object.ink.document, {
    renderingProfile: 'word',
    maxPoints: Infinity,
    maxPixels: Infinity,
    scale,
    bounds,
    sampleTransform: [a * 0.75, b * 0.75, c * 0.75, d * 0.75, e * 0.75, f * 0.75],
    brushRotation: Math.atan2(b, a),
    brushReflection: a * d - b * c < 0,
  });
  if (!raster.supported) return artifact;
  // Duplicates may share the original fallback part; give this object its own cached image.
  let n = 1;
  while (artifact.document.package.getPart(`/ppt/media/inkEdit${n}.png`)) n++;
  const image = `/ppt/media/inkEdit${n}.png`;
  const tx = beginPackageTransaction(artifact.document.package);
  tx.addPart(image, 'image/png', encodeInkPng(raster.width, raster.height, raster.data));
  const used = new Set(artifact.document.package.relationships(part.name).items.map((r) => r.id));
  let relId = n;
  while (used.has(`rIdInkEdit${relId}`)) relId++;
  const id = `rIdInkEdit${relId}`;
  tx.addRelationship(part.name, { id, type: relation.type, target: image });
  const edit = beginLosslessXmlEdit(source);
  edit.setAttribute(
    find(picture)!.attributes.find((a) => a.localName === 'embed')!,
    id,
  );
  tx.replacePart(object.sourcePart, edit.commit().bytes);
  return openPresentationArtifact(tx.commit(), artifact.options);
}
