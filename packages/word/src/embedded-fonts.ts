import { OOXML_NAMESPACES, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { RelationshipsError, parseRelationships, type OpcPart, type Relationships } from '@tumblerjs/opc';
import type { WordDocument } from './document.ts';

export interface WordEmbeddedFont {
  readonly family: string;
  readonly bold: boolean;
  readonly italic: boolean;
  /** Deobfuscated font data for displaying this document, not system installation. */
  readonly bytes: Uint8Array;
}
const documents = new WeakMap<WordDocument, readonly WordEmbeddedFont[]>();
const forms = { embedRegular: [false, false], embedBold: [true, false], embedItalic: [false, true], embedBoldItalic: [true, true] } as const;

/** ECMA-376 §17.8.1: reverse the GUID bytes, then XOR the first two 16-byte blocks. */
function deobfuscate(bytes: Uint8Array, key: string | undefined): Uint8Array | undefined {
  if (key === undefined) return bytes;
  const guidText = key.replace(/^\{(.*)\}$/, '$1');
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(guidText) || bytes.length < 32) return;
  const guid = key.replace(/[{}-]/g, '').match(/../g)!.map(byte => Number.parseInt(byte, 16)).reverse();
  const output = bytes.slice();
  for (let i = 0; i < 32; i++) output[i] = output[i]! ^ guid[i % 16]!;
  return output;
}

/** Resolve only internal font parts. Missing optional font resources use the renderer's fallback. */
export function readWordEmbeddedFonts(document: WordDocument): readonly WordEmbeddedFont[] {
  const cached = documents.get(document);
  if (cached) return cached;
  const fonts: WordEmbeddedFont[] = [];
  const { package: pkg, conformance } = document;
  const ns = OOXML_NAMESPACES[conformance].wordprocessing;
  const rel = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const relationships = (part: OpcPart): Relationships | undefined => {
    try { return parseRelationships(pkg.archive, part.name); }
    catch (error) { if (!(error instanceof RelationshipsError) || error.code !== 'missing_item') throw error; }
  };
  const tableLink = relationships(document.part)?.byType(`${rel}/fontTable`)[0];
  const table = tableLink?.targetMode === 'Internal' ? pkg.getPart(tableLink.targetPartName) : undefined;
  if (table?.contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml') {
    const root = parseLosslessXml(pkg.readPart(table)).root;
    const links = relationships(table);
    if (root.namespaceUri === ns && root.localName === 'fonts') for (const font of elements(root, ns, 'font')) {
      const family = attr(font, ns, 'name');
      if (!family) continue;
      for (const [form, [bold, italic]] of Object.entries(forms)) for (const embedded of elements(font, ns, form)) {
        const id = attr(embedded, rel, 'id');
        const link = id === undefined ? undefined : links?.get(id);
        const part = link?.targetMode === 'Internal' && link.type === `${rel}/font` ? pkg.getPart(link.targetPartName) : undefined;
        if (!part || !['application/vnd.openxmlformats-officedocument.obfuscatedFont', 'application/x-font-ttf'].includes(part.contentType)) continue;
        const key = attr(embedded, ns, 'fontKey');
        if (part.contentType.endsWith('.obfuscatedFont') && key === undefined) continue;
        const bytes = deobfuscate(pkg.readPart(part), key);
        if (bytes) fonts.push(Object.freeze({ family, bold, italic, bytes }));
      }
    }
  }
  const result = Object.freeze(fonts);
  documents.set(document, result);
  return result;
}
function elements(parent: LosslessXmlElement, ns: string, name: string): LosslessXmlElement[] {
  return parent.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === ns && child.localName === name);
}
function attr(element: LosslessXmlElement, ns: string, name: string) {
  return element.attributes.find(attribute => attribute.namespaceUri === ns && attribute.localName === name)?.value;
}
