import { beginPackageTransaction } from '@tumblerjs/opc';
import { createWordArtifact, openWordArtifact } from '../src/index.ts';

/** Imported square-wrapped image placed below a ten-point exact cell. */
export function tableDrawingOptOutFixture(value = '0', wrap = 'square') {
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'));
  const source = createWordArtifact({ blocks: [{ kind: 'table', rowFormats: [{ heightTwips: 200, heightRule: 'exact' }], rows: [[{ blocks: [{ kind: 'paragraph', runs: [{ text: '\ufffc', image: { bytes: png, contentType: 'image/png', width: 20, height: 20, layout: 'front', x: 0, y: 30, alt: 'Outside cell' } }] }] }]] }] });
  const edit = beginPackageTransaction(source.document.package);
  const xml = source.document.source.source.replace('layoutInCell="1"', value === 'omitted' ? '' : `layoutInCell="${value}"`).replace('<wp:wrapNone/>', wrap === 'square' ? '<wp:wrapSquare wrapText="bothSides"/>' : '<wp:wrapNone/>');
  edit.replacePart(source.document.part.name, new TextEncoder().encode(xml));
  return openWordArtifact(edit.commit());
}
