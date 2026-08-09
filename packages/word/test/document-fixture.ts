import { buildDeflatedZip } from "../../opc/test/zip-builder.ts";

const encoder = new TextEncoder();
const CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";
const RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";
const MAIN_DOCUMENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

export interface WordFixtureRelationship {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly targetMode?: "External";
}

export interface WordDocumentFixtureOptions {
  readonly conformance?: "strict" | "transitional";
  readonly documentItemName?: string;
  readonly documentXml?: string;
  readonly relationships?: readonly WordFixtureRelationship[];
  readonly parts?: readonly {
    readonly itemName: string;
    readonly contentType: string;
    readonly xml: string;
  }[];
}

export function buildWordDocumentFixture(options: WordDocumentFixtureOptions = {}): Uint8Array {
  const conformance = options.conformance ?? "transitional";
  const documentItemName = options.documentItemName ?? "word/document.xml";
  const wordprocessing = conformance === "strict"
    ? "http://purl.oclc.org/ooxml/wordprocessingml/main"
    : "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const officeRelationships = conformance === "strict"
    ? "http://purl.oclc.org/ooxml/officeDocument/relationships"
    : "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const documentXml = options.documentXml ?? `<w:document xmlns:w="${wordprocessing}"><w:body><w:p/></w:body></w:document>`;
  const relationshipItemName = relationshipName(documentItemName);
  return buildDeflatedZip([
    {
      name: "[Content_Types].xml",
      data: encoder.encode(`<Types xmlns="${CONTENT_TYPES}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${documentItemName}" ContentType="${MAIN_DOCUMENT_TYPE}"/>${options.parts?.map((part) => `<Override PartName="/${part.itemName}" ContentType="${part.contentType}"/>`).join("") ?? ""}</Types>`),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(`<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="main" Type="${officeRelationships}/officeDocument" Target="${documentItemName}"/></Relationships>`),
    },
    { name: documentItemName, data: encoder.encode(documentXml) },
    ...(options.relationships === undefined ? [] : [{
      name: relationshipItemName,
      data: encoder.encode(`<Relationships xmlns="${RELATIONSHIPS}">${options.relationships.map((relationship) =>
        `<Relationship Id="${relationship.id}" Type="${relationship.type}" Target="${relationship.target}"${relationship.targetMode === "External" ? ' TargetMode="External"' : ""}/>`
      ).join("")}</Relationships>`),
    }]),
    ...(options.parts?.map((part) => ({ name: part.itemName, data: encoder.encode(part.xml) })) ?? []),
  ]);
}

function relationshipName(itemName: string): string {
  const slash = itemName.lastIndexOf("/");
  return `${itemName.slice(0, slash + 1)}_rels/${itemName.slice(slash + 1)}.rels`;
}
