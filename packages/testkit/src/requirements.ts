export type CapabilityStage = "recognize" | "preserve" | "render" | "edit" | "write" | "interoperate";
export type CapabilityStatus = "supported" | "partial" | "unsupported" | "unverified";
export type RequirementLevel = "must" | "should" | "may";

export interface CapabilityEvidence {
  readonly status: CapabilityStatus;
  readonly tests: readonly string[];
  readonly note?: string;
}

export interface StandardsRequirement {
  readonly id: string;
  readonly source: "ECMA-376-1" | "ECMA-376-2" | "ECMA-376-3" | "MS-XLSX";
  readonly clause: string;
  readonly area: string;
  readonly level: RequirementLevel;
  readonly evidence: Readonly<Partial<Record<CapabilityStage, CapabilityEvidence>>>;
}

const stages: readonly CapabilityStage[] = ["recognize", "preserve", "render", "edit", "write", "interoperate"];

export function defineRequirementManifest(requirements: readonly StandardsRequirement[]): readonly StandardsRequirement[] {
  const identifiers = new Set<string>();
  for (const requirement of requirements) {
    if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(requirement.id)) throw new TypeError(`Invalid requirement id ${JSON.stringify(requirement.id)}.`);
    if (identifiers.has(requirement.id)) throw new TypeError(`Duplicate requirement id ${requirement.id}.`);
    if (requirement.clause.trim() === "" || requirement.area.trim() === "") throw new TypeError(`Requirement ${requirement.id} is missing its source location.`);
    identifiers.add(requirement.id);
    for (const stage of stages) {
      const evidence = requirement.evidence[stage];
      if (evidence?.status === "supported" && evidence.tests.length === 0) {
        throw new TypeError(`Requirement ${requirement.id} claims ${stage} support without a test.`);
      }
    }
  }
  return Object.freeze([...requirements]);
}

export function capabilityMatrix(requirements: readonly StandardsRequirement[]) {
  return requirements.map((requirement) => Object.freeze({
    id: requirement.id,
    area: requirement.area,
    ...Object.fromEntries(stages.map((stage) => [stage, requirement.evidence[stage]?.status ?? "unverified"])),
  }));
}

export const SPREADSHEET_REQUIREMENTS = defineRequirementManifest([
  requirement("XLSX-WORKBOOK-DISCOVERY", "§12.3.23", "spreadsheet.workbook", ["package.test.ts", "workbook.test.ts"], { render: "supported" }),
  requirement("XLSX-WORKSHEET-DISCOVERY", "§12.3.24", "spreadsheet.worksheet", ["workbook.test.ts"], { render: "supported" }),
  requirement("XLSX-SHEET-IDENTITY", "§18.2.19–20, §18.2.27", "spreadsheet.sheets", ["workbook.test.ts"], { render: "supported" }),
  requirement("XLSX-SHEET-TAB-COLOR", "§18.3.1.82–83", "spreadsheet.sheet-tabs", ["sheet-properties.test.ts"], { recognize: "supported", preserve: "supported", render: "supported" }),
  requirement("XLSX-SPARSE-CELLS", "§18.3.1.4", "spreadsheet.cells", ["worksheet.test.ts", "editor.property.test.ts"], { render: "supported", edit: "supported", write: "supported" }),
  requirement("XLSX-SHEET-GEOMETRY", "§18.3.1.13, §18.3.1.35, §18.3.1.73", "spreadsheet.geometry", ["worksheet.test.ts", "sparse-axis.test.ts", "spreadsheet-viewport.test.ts"], { render: "partial" }),
  requirement("XLSX-MERGED-CELLS", "§18.3.1.55", "spreadsheet.merges", ["worksheet.test.ts", "spreadsheet-viewport.test.ts"], { render: "partial" }),
  requirement("XLSX-SHEET-PANES", "§18.3.1.66, §18.3.1.87–88", "spreadsheet.views", ["worksheet.test.ts", "spreadsheet-viewport.test.ts"], { render: "partial" }),
  requirement("XLSX-SHARED-STRINGS", "§18.4.8–9", "spreadsheet.strings", ["shared-strings.test.ts"], { render: "partial", preserve: "supported" }),
  requirement("XLSX-CELL-STYLES", "§18.8.1–45", "spreadsheet.styles", ["styles.test.ts", "styles.property.test.ts", "worksheet.test.ts", "spreadsheet-cell-style.test.ts"], { render: "partial", preserve: "supported" }),
  requirement("XLSX-CALCULATION-STATE", "§18.2.2, §18.6.2", "spreadsheet.calculation", ["workbook.test.ts", "editor.test.ts", "check-spreadsheet-roundtrip.ts"], { recognize: "supported", preserve: "supported", edit: "supported", write: "supported", interoperate: "partial" }),
  requirement("XLSX-THEME-FONTS", "§20.1.6.10, §20.1.4.1.17", "spreadsheet.theme-fonts", ["theme-fonts.test.ts", "styles.test.ts", "spreadsheet-viewport.test.ts"], { render: "partial", preserve: "supported" }),
  requirement("XLSX-CELL-TYPES", "§18.18.11", "spreadsheet.values", ["worksheet.test.ts", "editor.test.ts"], { render: "supported", edit: "partial", write: "partial" }),
  requirement("XLSX-TABLE-PARTS", "§18.3.1.94–95, §18.5.1.2–3", "spreadsheet.tables", ["tables.test.ts", "table-view.test.ts", "preservation.test.ts"], { recognize: "supported", preserve: "supported", render: "partial" }),
  requirement("XLSX-AUTOFILTER", "§18.3.1.2, §18.3.1.92, §18.3.2.7–10", "spreadsheet.filters", ["tables.test.ts", "table-view.test.ts", "spreadsheet-viewport.test.ts"], { recognize: "partial", preserve: "supported", render: "partial" }),
  requirement("XLSX-FORMULA-GRAMMAR", "§2.2.2", "spreadsheet.formula-grammar", ["parser.test.ts", "calculation.test.ts"], { recognize: "partial", preserve: "supported", render: "partial" }, "MS-XLSX"),
  requirement("XLSX-FORMULA-EVALUATION", "§18.17.2–7", "spreadsheet.formula-evaluation", ["evaluator.test.ts", "calculation.test.ts", "spreadsheet-viewport.test.ts"], { recognize: "partial", preserve: "supported", render: "partial", edit: "partial" }),
] as const);

function requirement(
  id: string,
  clause: string,
  area: string,
  tests: readonly string[],
  statuses: Readonly<Partial<Record<CapabilityStage, CapabilityStatus>>>,
  source: StandardsRequirement["source"] = "ECMA-376-1",
): StandardsRequirement {
  const evidence = Object.fromEntries(Object.entries(statuses).map(([stage, status]) => [stage, { status, tests }]));
  return { id, source, clause, area, level: "must", evidence };
}
