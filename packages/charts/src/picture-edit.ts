import { chartBase64ToBytes } from './base64.ts';
import type { ChartContent } from './part-content.ts';
import { chartPropertyTree, insertChartProperty, type ChartPropertyNode } from './properties.ts';
import { editChartSource } from './source-edit.ts';
import { chartXml, chartXmlText } from './source-xml.ts';

const local = (node: ChartPropertyNode) => node.name.split(':').at(-1);
function pathTo(node: ChartPropertyNode, id: number): readonly number[] | undefined {
  if (node.id === id) return [];
  for (const [index, child] of node.children.entries()) { const path = pathTo(child, id); if (path) return [index, ...path]; }
  return undefined;
}
function at(root: ChartPropertyNode, path: readonly number[]) { return path.reduce((node, index) => node.children[index]!, root); }

export function canSetChartPicture(node: ChartPropertyNode): boolean {
  const shape = local(node) === 'spPr' ? node : node.children.find(child => local(child) === 'spPr');
  return shape ? shape.children.some(child => local(child) === 'blipFill') || shape.availableChildren.some(child => child.definition.endsWith('/a:blipFill')) : node.availableChildren.some(child => child.definition.endsWith('/c:spPr'));
}

/** Attach an image to a snapshot-addressed fill, retaining crop, tiling and other existing effects.
 * Pass complete content from readChartContent to preserve all other related parts.
 */
export function setChartPictureFill(content: ChartContent, nodeId: number, image: { readonly data: string; readonly contentType: string }): ChartContent {
  if (!image.contentType.startsWith('image/') || !chartBase64ToBytes(image.data).length) throw new TypeError('A picture fill requires image bytes and an image content type.');
  let source: Uint8Array = new TextEncoder().encode(content.xml);
  let tree = chartPropertyTree(source);
  const path = pathTo(tree, nodeId);
  if (!path) throw new RangeError('The chart fill target changed. Read the chart again.');
  let owner = at(tree, path);
  if (!canSetChartPicture(owner)) throw new TypeError('This chart property has no picture fill.');
  let shapePath = path;
  if (local(owner) !== 'spPr') {
    let index = owner.children.findIndex(child => local(child) === 'spPr');
    if (index < 0) {
      const definition = owner.availableChildren.find(child => child.definition.endsWith('/c:spPr'))!;
      source = insertChartProperty(source, owner.id, definition.definition);
      tree = chartPropertyTree(source); owner = at(tree, path);
      index = owner.children.findIndex(child => local(child) === 'spPr');
    }
    shapePath = [...path, index];
  }
  let shape = at(tree, shapePath), fill = shape.children.find(child => local(child) === 'blipFill');
  const resources = content.resources ?? { parts: [], relationships: [] };
  const sourceXml = chartXml(source), drawing = sourceXml.namespace.replace(/chart$/, 'main');
  const relationshipNamespace = sourceXml.namespace.includes('purl.oclc.org') ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const existingPart = resources.parts.find(part => part.contentType === image.contentType && part.data === image.data);
  const keys = new Set(resources.parts.map(part => part.key));
  let key = existingPart?.key ?? 'chart-picture';
  for (let suffix = 1; !existingPart && keys.has(key); suffix++) key = `chart-picture-${suffix}`;
  const existingRelation = resources.relationships.find(item => item.targetMode !== 'External' && item.type.endsWith('/image') && item.target === key);
  const used = new Set([...resources.relationships.map(item => item.id), ...sourceXml.document.elements().flatMap(node => node.attributes.filter(attribute => attribute.namespaceUri.endsWith('/relationships')).map(attribute => attribute.value))]);
  let id = existingRelation?.id ?? 'chart-picture';
  for (let suffix = 1; !existingRelation && used.has(id); suffix++) id = `chart-picture-${suffix}`;
  const blipMarkup = `<a:blip xmlns:a="${drawing}" xmlns:r="${relationshipNamespace}" r:embed="${chartXmlText(id)}"/>`;
  if (!fill) {
    source = insertChartProperty(source, shape.id, 'a:CT_BlipFillProperties/a:blipFill');
    tree = chartPropertyTree(source); shape = at(tree, shapePath); fill = shape.children.find(child => local(child) === 'blipFill')!;
    source = editChartSource(source, [{ kind: 'replace', node: fill.id, markup: `<a:blipFill xmlns:a="${drawing}">${blipMarkup}<a:stretch><a:fillRect/></a:stretch></a:blipFill>` }]);
  } else {
    const blip = fill.children.find(child => local(child) === 'blip');
    if (blip) {
      const original = sourceXml.document.element(blip.id)!;
      const embed = original.attributes.find(attribute => attribute.namespaceUri === relationshipNamespace && attribute.localName === 'embed');
      const links = original.attributes.filter(attribute => attribute.namespaceUri.endsWith('/relationships') && attribute.localName === 'link').map(attribute => ({ kind: 'attribute' as const, node: blip.id, name: attribute.qualified, value: null }));
      if (embed) source = editChartSource(source, [...links, { kind: 'attribute', node: blip.id, name: embed.qualified, value: id }]);
      else {
        const declarations = new Set(sourceXml.document.elements().flatMap(node => node.attributes.filter(attribute => attribute.namespaceUri === 'http://www.w3.org/2000/xmlns/').map(attribute => attribute.qualified)));
        let prefix = 'pictureRel'; for (let suffix = 1; declarations.has(`xmlns:${prefix}`); suffix++) prefix = `pictureRel${suffix}`;
        source = editChartSource(source, [...links, { kind: 'attribute', node: blip.id, name: `xmlns:${prefix}`, value: relationshipNamespace }, { kind: 'attribute', node: blip.id, name: `${prefix}:embed`, value: id }]);
      }
    } else source = editChartSource(source, [fill.children[0] ? { kind: 'before', node: fill.children[0].id, markup: blipMarkup } : { kind: 'append', node: fill.id, markup: blipMarkup }]);
  }
  const xml = new TextDecoder().decode(source);
  if (xml === content.xml && existingPart && existingRelation) return content;
  return { ...content, xml, resources: {
    parts: existingPart ? resources.parts : [...resources.parts, { key, data: image.data, contentType: image.contentType }],
    relationships: existingRelation ? resources.relationships : [...resources.relationships, { id, type: `${relationshipNamespace}/image`, target: key }],
  } };
}
