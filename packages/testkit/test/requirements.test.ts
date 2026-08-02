import { describe, expect, test } from "bun:test";
import {
  capabilityMatrix,
  defineFixtureManifest,
  defineRequirementManifest,
  SPREADSHEET_REQUIREMENTS,
} from "../src/index.ts";

describe("standards requirement manifests", () => {
  test("projects explicit spreadsheet capability stages", () => {
    const matrix = capabilityMatrix(SPREADSHEET_REQUIREMENTS);
    expect(matrix).toHaveLength(23);
    expect(matrix.find((entry) => entry.id === "XLSX-CELL-STYLES")).toMatchObject({
      recognize: "unverified",
      preserve: "supported",
      render: "partial",
      edit: "unverified",
      interoperate: "unverified",
    });
    expect(matrix.find((entry) => entry.id === "XLSX-CALCULATION-STATE")).toMatchObject({
      recognize: "supported",
      preserve: "supported",
      edit: "supported",
      write: "supported",
      interoperate: "partial",
    });
    expect(matrix.find((entry) => entry.id === "XLSX-AUTOFILTER")).toMatchObject({
      recognize: "partial",
      preserve: "supported",
      render: "partial",
      edit: "unverified",
      write: "unverified",
    });
    expect(matrix.find((entry) => entry.id === "XLSX-HYPERLINKS")).toMatchObject({
      recognize: "supported",
      preserve: "supported",
      render: "partial",
      edit: "unverified",
      write: "unverified",
    });
    expect(matrix.find((entry) => entry.id === "XLSX-CHART-PARTS")).toMatchObject({
      recognize: "unverified",
      preserve: "supported",
      render: "unverified",
      edit: "unverified",
      write: "unverified",
    });
    expect(matrix.find((entry) => entry.id === "XLSX-FORMULA-EVALUATION")).toMatchObject({
      recognize: "partial",
      preserve: "supported",
      render: "partial",
      edit: "partial",
      write: "unverified",
    });
  });

  test("rejects duplicate and unevidenced support claims", () => {
    const base = SPREADSHEET_REQUIREMENTS[0]!;
    expect(() => defineRequirementManifest([base, base])).toThrow("Duplicate requirement id");
    expect(() => defineRequirementManifest([{ ...base, id: "XLSX-NO-EVIDENCE", evidence: { render: { status: "supported", tests: [] } } }])).toThrow("without a test");
  });
});

describe("fixture manifests", () => {
  test("records redistributable synthetic fixture identity", () => {
    const fixtures = defineFixtureManifest([{
      id: "styled-colors",
      format: "xlsx",
      producer: "Tumbler testkit",
      provenance: "generated",
      privacy: "synthetic",
      license: "MIT",
      features: ["styles", "theme-colors"],
      expectedBehavior: "Opens with opaque authored colors.",
    }]);
    expect(fixtures[0] && `${fixtures[0].format}:${fixtures[0].id}`).toBe("xlsx:styled-colors");
  });

  test("keeps customer-derived fixtures private and validates checksums", () => {
    const base = {
      id: "customer-regression",
      format: "xlsx" as const,
      producer: "Unknown",
      provenance: "customer-minimized" as const,
      privacy: "public" as const,
      license: "Private test use only",
      features: ["styles"],
      expectedBehavior: "Preserves formatting.",
    };
    expect(() => defineFixtureManifest([base])).toThrow("must remain private");
    expect(() => defineFixtureManifest([{ ...base, privacy: "private", sha256: "bad" }])).toThrow("invalid SHA-256");
  });
});
