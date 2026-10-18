import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { readOfficeInk, replaceOfficeInkTrace, renderOfficeInkSvg, encodeInkTrace } from '../packages/ink/src/index.ts';
import { bytes, officeInk } from '../packages/ink/test/fixture.ts';
import { buildWordDocumentFixture } from '../packages/word/test/document-fixture.ts';

const directory = process.argv[2];
if (!directory) throw Error('Usage: bun scripts/generate-ink-conformance.ts OUTPUT_DIRECTORY');
await mkdir(directory, { recursive: true });
const cases = [
  officeInk().replace(/(<\/context>)(\s*)(<brush[\s\S]*?<\/brush>)/, '$3$1$2'),
  officeInk(), officeInk({ trace: '1 0,1 0' }), officeInk({ trace: `0 0,'10'20,"2"-3,**` }),
  officeInk({ channels: '<channel name="X"/><channel name="Y"/><channel name="F" type="integer" max="100"/>', trace: '0 0 100,1000 1000 50' }),
  officeInk({ channels: '<channel name="X"/><channel name="Y"/><channel name="S" type="boolean"/>', trace: '0 0 T,1000 1000 F' }),
  officeInk({ brush: '<brushProperty name="tip" value="rectangle"/><brushProperty name="color" value="#abcdef"/>' }),
  ...fc.sample(fc.array(fc.tuple(fc.integer({ min: -100000, max: 100000 }), fc.integer({ min: -100000, max: 100000 })), { minLength: 1, maxLength: 100 }), { seed: 376, numRuns: 100 }).map(points => officeInk({ trace: encodeInkTrace(points, [{ name: 'X', type: 'integer' }, { name: 'Y', type: 'integer' }]) })),
];
for (const [index, xml] of cases.entries()) {
  const ink = readOfficeInk(bytes(xml));
  if (ink.diagnostics.length) throw Error(JSON.stringify(ink.diagnostics));
  await Bun.write(resolve(directory, `${index}.inkml`), xml);
  const trace = ink.traces[0]!;
  const edited = replaceOfficeInkTrace(ink, trace.elementId, trace.points.slice(0, 1));
  await Bun.write(resolve(directory, `${index}-edited.inkml`), edited.source.originalBytes());
  const rendering = renderOfficeInkSvg(ink);
  if (rendering.supported) await Bun.write(resolve(directory, `${index}.svg`), rendering.svg);
}

const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
// Word LTSC 2024 rejects a referenced brush nested in context, even though
// that placement passes the InkML schema. Keep the DOCX controls Word-readable.
const wordInk = officeInk();
const documentXml = `<w:document xmlns:w="${w}" xmlns:r="${r}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" mc:Ignorable="w14 wpi"><w:body><w:p><w:r><w:t>Native InkML fixture</w:t></w:r></w:p><w:p><w:r><mc:AlternateContent><mc:Choice Requires="wpi"><w:drawing><wp:inline><wp:extent cx="360000" cy="360000"/><wp:docPr id="1" name="Ink"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"><w14:contentPart r:id="ink"><w14:nvContentPartPr><w14:cNvContentPartPr/></w14:nvContentPartPr><w14:xfrm><a:off x="0" y="0"/><a:ext cx="360000" cy="360000"/></w14:xfrm></w14:contentPart></a:graphicData></a:graphic></wp:inline></w:drawing></mc:Choice></mc:AlternateContent></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;
const docx = (xml: string, ink = wordInk) => buildWordDocumentFixture({
  documentXml: xml, relationships: [{ id: 'ink', type: `${r}/customXml`, target: 'ink/ink.xml' }],
  parts: [{ itemName: 'word/ink/ink.xml', contentType: 'application/inkml+xml', xml: ink }],
});
await Bun.write(resolve(directory, 'native-only.docx'), docx(documentXml));
// SDK markup compatibility can skip an unrecognized Requires namespace. Validate
// the selected content directly too, with a negative control proving it was read.
const direct = documentXml.replace('<mc:AlternateContent><mc:Choice Requires="wpi">', '').replace('</mc:Choice></mc:AlternateContent>', '');
await Bun.write(resolve(directory, 'direct-native.docx'), docx(direct));
await mkdir(resolve(directory, 'invalid'), { recursive: true });
await Bun.write(resolve(directory, 'invalid/transform.docx'), docx(direct.replace('<w14:xfrm>', '<w14:xfrm rot="bad">')));
await Bun.write(resolve(directory, 'invalid/nested-brush.docx'), docx(direct, cases[0]!));
console.log(`Generated ${cases.length * 2} InkML files, SVG previews and native DOCX controls in ${directory}.`);

// Exercise native geometry through the same public API used by host editors and exports.
const { openWordArtifact } = await import('../packages/word/src/index.ts');
for (const [name, xml] of [['native-only', documentXml], ['direct-native', direct]] as const) {
  let artifact = openWordArtifact(docx(xml));
  for (const layout of ['front', 'behind', 'inline'] as const) {
    const drawing = [...artifact.document.drawings.values()][0]!;
    artifact = artifact.updateDrawing({ elementId: drawing.elementId, widthPoints: 80, heightPoints: 60,
      layout, xPoints: 100, yPoints: 120, horizontalRelativeTo: 'page', verticalRelativeTo: 'page' });
    await Bun.write(resolve(directory, `${name}-${layout}.docx`), artifact.bytes());
  }
}

// Stroke edits must validate both the copied native part and regenerated legacy preview.
for (const [name, xml] of [['native-only', documentXml], ['direct-native', direct]] as const) {
  const artifact = openWordArtifact(docx(xml));
  const drawing = [...artifact.document.drawings.values()][0]!;
  const edited = artifact.replaceInkTrace({ elementId: drawing.elementId, traceElementId: drawing.ink!.traces[0]!.elementId, points: [[0, 1000], [1000, 0]] });
  await Bun.write(resolve(directory, `${name}-stroke-edited.docx`), edited.bytes());
}
const fallbackXml = documentXml.replace('</mc:Choice>', '</mc:Choice><mc:Fallback><w:pict><v:shape xmlns:v="urn:schemas-microsoft-com:vml" style="width:30pt;height:30pt"><v:imagedata r:id="bitmap"/></v:shape></w:pict></mc:Fallback>');
const fallbackArtifact = openWordArtifact(buildWordDocumentFixture({
  documentXml: fallbackXml,
  relationships: [{ id: 'ink', type: `${r}/customXml`, target: 'ink/ink.xml' }, { id: 'bitmap', type: `${r}/image`, target: 'media/ink.png' }],
  parts: [{ itemName: 'word/ink/ink.xml', contentType: 'application/inkml+xml', xml: wordInk }, { itemName: 'word/media/ink.png', contentType: 'image/png', xml: 'unused synthetic cache' }],
}));
const fallbackDrawing = [...fallbackArtifact.document.drawings.values()][0]!;
const fallbackEdited = fallbackArtifact.replaceInkTrace({ elementId: fallbackDrawing.elementId, traceElementId: fallbackDrawing.ink!.traces[0]!.elementId, points: [[0, 1000], [1000, 0]] });
await Bun.write(resolve(directory, 'fallback-stroke-edited.docx'), fallbackEdited.bytes());
