import { buildDeflatedZip } from "../../opc/test/zip-builder.ts";

const encoder = new TextEncoder();
const CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";
const RELATIONSHIPS = "http://schemas.openxmlformats.org/package/2006/relationships";
const WORKBOOK_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const WORKSHEET_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const SHARED_STRINGS_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml";
const THEME_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.theme+xml";
const CALCULATION_CHAIN_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml";

export interface SheetFixture {
  readonly name: string;
  readonly sheetId: number | string;
  readonly relationshipId: string;
  readonly target?: string;
  readonly state?: string;
  readonly xml?: string;
  readonly relationshipType?: string;
  readonly targetMode?: "External";
}

export interface WorkbookFixtureOptions {
  readonly conformance?: "strict" | "transitional";
  readonly workbookItemName?: string;
  readonly sheets?: readonly SheetFixture[];
  readonly workbookXml?: string;
  readonly sharedStringsXml?: string;
  readonly stylesXml?: string;
  readonly themeXml?: string;
  readonly calculationChainXml?: string;
}

export function buildWorkbookFixture(options: WorkbookFixtureOptions = {}): Uint8Array {
  const conformance = options.conformance ?? "transitional";
  const workbookItemName = options.workbookItemName ?? "xl/workbook.xml";
  const sheets = options.sheets ?? [{ name: "Sheet1", sheetId: 1, relationshipId: "sheet1" }];
  const spreadsheet = conformance === "strict"
    ? "http://purl.oclc.org/ooxml/spreadsheetml/main"
    : "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const officeRelationships = conformance === "strict"
    ? "http://purl.oclc.org/ooxml/officeDocument/relationships"
    : "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const officeDocumentRelationship = `${officeRelationships}/officeDocument`;
  const worksheetRelationship = `${officeRelationships}/worksheet`;
  const slash = workbookItemName.lastIndexOf("/");
  const directory = workbookItemName.slice(0, slash + 1);
  const filename = workbookItemName.slice(slash + 1);
  const relationshipItemName = `${directory}_rels/${filename}.rels`;
  const sharedStringsItemName = `${directory}strings/shared.xml`;
  const stylesItemName = `${directory}styles/style.xml`;
  const themeItemName = `${directory}theme/theme1.xml`;
  const calculationChainItemName = `${directory}calcChain.xml`;
  const workbookXml = options.workbookXml ?? `<workbook xmlns="${spreadsheet}" xmlns:r="${officeRelationships}"><sheets>${sheets.map((sheet) =>
    `<sheet name="${sheet.name}" sheetId="${sheet.sheetId}" r:id="${sheet.relationshipId}"${sheet.state === undefined ? "" : ` state="${sheet.state}"`}/>`
  ).join("")}</sheets></workbook>`;

  return buildDeflatedZip([
    {
      name: "[Content_Types].xml",
      data: encoder.encode(`<Types xmlns="${CONTENT_TYPES}">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/${workbookItemName}" ContentType="${WORKBOOK_TYPE}"/>
        ${sheets.filter((sheet) => sheet.targetMode !== "External").map((sheet, index) =>
          `<Override PartName="/${resolveTargetItemName(directory, sheet.target ?? `worksheets/sheet${index + 1}.xml`)}" ContentType="${WORKSHEET_TYPE}"/>`
        ).join("")}
        ${options.sharedStringsXml === undefined ? "" : `<Override PartName="/${sharedStringsItemName}" ContentType="${SHARED_STRINGS_CONTENT_TYPE}"/>`}
        ${options.stylesXml === undefined ? "" : `<Override PartName="/${stylesItemName}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`}
        ${options.themeXml === undefined ? "" : `<Override PartName="/${themeItemName}" ContentType="${THEME_CONTENT_TYPE}"/>`}
        ${options.calculationChainXml === undefined ? "" : `<Override PartName="/${calculationChainItemName}" ContentType="${CALCULATION_CHAIN_CONTENT_TYPE}"/>`}
      </Types>`),
    },
    {
      name: "_rels/.rels",
      data: encoder.encode(`<Relationships xmlns="${RELATIONSHIPS}"><Relationship Id="main" Type="${officeDocumentRelationship}" Target="${workbookItemName}"/></Relationships>`),
    },
    { name: workbookItemName, data: encoder.encode(workbookXml) },
    {
      name: relationshipItemName,
      data: encoder.encode(`<Relationships xmlns="${RELATIONSHIPS}">${sheets.map((sheet, index) => {
        const target = sheet.target ?? `worksheets/sheet${index + 1}.xml`;
        return `<Relationship Id="${sheet.relationshipId}" Type="${sheet.relationshipType ?? worksheetRelationship}" Target="${target}"${sheet.targetMode === "External" ? ' TargetMode="External"' : ""}/>`;
      }).join("")}${options.sharedStringsXml === undefined ? "" : `<Relationship Id="strings" Type="${officeRelationships}/sharedStrings" Target="strings/shared.xml"/>`}${options.stylesXml === undefined ? "" : `<Relationship Id="styles" Type="${officeRelationships}/styles" Target="styles/style.xml"/>`}${options.themeXml === undefined ? "" : `<Relationship Id="theme" Type="${officeRelationships}/theme" Target="theme/theme1.xml"/>`}${options.calculationChainXml === undefined ? "" : `<Relationship Id="calculation-chain" Type="${officeRelationships}/calcChain" Target="calcChain.xml"/>`}</Relationships>`),
    },
    ...sheets.flatMap((sheet, index) => sheet.targetMode === "External" ? [] : [{
      name: resolveTargetItemName(directory, sheet.target ?? `worksheets/sheet${index + 1}.xml`),
      data: encoder.encode(sheet.xml ?? `<worksheet xmlns="${spreadsheet}"><sheetData/></worksheet>`),
    }]),
    ...(options.sharedStringsXml === undefined ? [] : [{
      name: sharedStringsItemName,
      data: encoder.encode(options.sharedStringsXml),
    }]),
    ...(options.stylesXml === undefined ? [] : [{ name: stylesItemName, data: encoder.encode(options.stylesXml) }]),
    ...(options.themeXml === undefined ? [] : [{ name: themeItemName, data: encoder.encode(options.themeXml) }]),
    ...(options.calculationChainXml === undefined ? [] : [{ name: calculationChainItemName, data: encoder.encode(options.calculationChainXml) }]),
  ]);
}

function resolveTargetItemName(directory: string, target: string): string {
  const segments = `${directory}${target}`.split("/");
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "..") resolved.pop();
    else if (segment !== "." && segment !== "") resolved.push(segment);
  }
  return resolved.join("/");
}
